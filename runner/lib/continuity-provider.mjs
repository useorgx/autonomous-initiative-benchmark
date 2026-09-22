import { digest, isNumber } from "./evidence-integrity.mjs";
const API = "https://openrouter.ai/api/v1";
export async function resolveModelManifest(ids, { fetchImpl = fetch } = {}) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length)
    throw new Error("Distinct explicit model IDs required");
  const response = await fetchImpl(`${API}/models`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Model catalog unavailable: HTTP ${response.status}`);
  const catalog = await response.json();
  if (!Array.isArray(catalog.data)) throw new Error("Invalid catalog");
  const models = ids.map((id) => {
    const row = catalog.data.find((m) => m.id === id);
    if (!row) throw new Error(`Requested model not in current catalog: ${id}`);
    const prompt = Number(row.pricing?.prompt),
      completion = Number(row.pricing?.completion);
    if (
      ![row.pricing?.prompt, row.pricing?.completion].every(
        (value) => typeof value === "number" || (typeof value === "string" && value.trim() !== "")
      ) ||
      !isNumber(prompt) ||
      !isNumber(completion) ||
      prompt < 0 ||
      completion < 0 ||
      !row.supported_parameters?.includes("tools")
    )
      throw new Error(`Unqualified model/pricing/tool support: ${id}`);
    return {
      id,
      canonical_slug: row.canonical_slug ?? id,
      catalog_created: row.created ?? null,
      pricing: row.pricing,
      context_length: row.context_length,
      supported_parameters: row.supported_parameters,
      reasoning: row.reasoning ?? null,
      identity_assurance: "catalog_bound_alias_not_weights_attestation",
    };
  });
  return {
    schema: "orgx.continuity-models/v1",
    resolved_at: new Date().toISOString(),
    catalog_digest: digest(catalog),
    models,
  };
}

export class SpendGuard {
  constructor(maxUsd) {
    if (!isNumber(maxUsd) || maxUsd <= 0)
      throw new Error("Positive USD cap required");
    this.maxUsd = maxUsd;
    this.observedUsd = 0;
    this.reservedUsd = 0;
    this.unknownCalls = 0;
    this.stopReason = null;
    this.nextId = 1;
    this.reservations = new Map();
  }
  halt(reason) {
    this.stopReason = String(reason);
  }
  reserve(request, model) {
    if (this.stopReason)
      throw new Error(`Provider unavailable: ${this.stopReason}`);
    if (this.unknownCalls)
      throw new Error(
        "Cost uncertainty: new calls blocked until reconciliation"
      );
    const p = model.pricing,
      output = request.max_completion_tokens ?? request.max_tokens;
    const prices = [
      p.prompt,
      p.completion,
      p.request ?? 0,
      ...(p.overrides ?? []).flatMap((x) => [x.prompt, x.completion]),
    ];
    if (
      !prices.every(
        (x) =>
          (typeof x === "number" ||
            (typeof x === "string" && x.trim() !== "")) &&
          Number.isFinite(Number(x)) &&
          Number(x) >= 0
      )
    )
      throw new Error("Finite nonnegative pricing required");
    if (!Number.isInteger(output) || output <= 0)
      throw new Error("Explicit output bound required");
    // Conservative TEXT-ONLY byte bound plus protocol overhead. Not a measured
    // token count and not a universal provider billing guarantee.
    const input = Buffer.byteLength(JSON.stringify(request), "utf8") + 4096;
    const inputPrice = Math.max(
      Number(p.prompt),
      ...(p.overrides ?? []).map((x) => Number(x.prompt) || 0)
    );
    const outputPrice = Math.max(
      Number(p.completion),
      ...(p.overrides ?? []).map((x) => Number(x.completion) || 0)
    );
    const usd =
      input * inputPrice + output * outputPrice + Number(p.request ?? 0);
    if (
      !isNumber(usd) ||
      this.observedUsd + this.reservedUsd + usd > this.maxUsd
    )
      throw new Error("Preregistered spend cap reached");
    const id = this.nextId++;
    this.reservations.set(id, usd);
    this.reservedUsd += usd;
    return id;
  }
  settle(id, cost) {
    const reserved = this.reservations.get(id);
    if (reserved === undefined)
      throw new Error("Invalid/double-settled reservation");
    this.reservations.delete(id);
    if (!isNumber(cost) || cost < 0) {
      this.unknownCalls++;
      return;
    }
    this.reservedUsd -= reserved;
    this.observedUsd += cost;
    if (this.observedUsd > this.maxUsd + 1e-9)
      throw new Error("Provider exceeded conservative budget guard");
  }
  snapshot() {
    return {
      max_usd: this.maxUsd,
      observed_usd: this.observedUsd,
      unreconciled_reserved_usd: this.reservedUsd,
      unknown_calls: this.unknownCalls,
      cost_complete: this.unknownCalls === 0 && this.reservations.size === 0,
    };
  }
}

export function createProviderCaller({
  model,
  key,
  guard,
  episodeGuard,
  emit,
  fetchImpl = fetch,
}) {
  if (!key) throw new Error("OPENROUTER_API_KEY unavailable");
  let attemptIndex = 0;
  return async (request) => {
    const body = {
      ...request,
      model: model.id,
      stream: false,
      provider: { allow_fallbacks: false, data_collection: "deny" },
      usage: { include: true },
    };
    // No implicit model fallbacks, hosted tools, external search or plugins.
    delete body.models;
    delete body.route;
    delete body.plugins;
    const started = Date.now(),
      row = {
        provider_call_index: ++attemptIndex,
        call_id: null,
        request_digest: digest(body),
        requested_model: model.id,
        status: "started",
        cost_usd: null,
        usage: null,
      };
    let globalId = null,
      localId = null,
      dispatched = false;
    try {
      // Reserve locally first. A global block is a pre-call event, not unknown spend.
      localId = episodeGuard.reserve(body, model);
      try {
        globalId = guard.reserve(body, model);
      } catch (e) {
        episodeGuard.settle(localId, 0);
        localId = null;
        throw e;
      }
      await emit({ ...row, status: "started" });
      dispatched = true;
      const response = await fetchImpl(`${API}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "X-OpenRouter-Title": "OrgX Continuity Development Evaluation",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000),
      });
      const data = await response.json();
      row.call_id = data.id ?? null;
      row.response_digest = digest(data);
      row.observed_model = data.model ?? null;
      row.provider = data.provider ?? null;
      row.fingerprint = data.system_fingerprint ?? null;
      const usage = data.usage;
      const cost = usage?.is_byok === true ? null : usage?.cost;
      row.usage = usage ?? null;
      row.cost_usd = isNumber(cost) && cost >= 0 ? cost : null;
      const globalReservation = globalId,
        localReservation = localId;
      globalId = null;
      localId = null;
      const settlementErrors = [];
      for (const [budget, id] of [
        [guard, globalReservation],
        [episodeGuard, localReservation],
      ]) {
        try {
          budget.settle(id, row.cost_usd);
        } catch (error) {
          settlementErrors.push(error);
        }
      }
      if (settlementErrors.length) throw settlementErrors[0];
      if ([400, 401, 402, 403, 404, 422].includes(response.status))
        guard.halt(`terminal HTTP ${response.status}`);
      if (!response.ok || data.error)
        throw new Error(
          `Provider failure HTTP ${response.status}: ${
            data.error?.code ?? "request_failed"
          }`
        );
      const allowed = [
        model.id,
        model.canonical_slug,
        ...[model.id, model.canonical_slug].map((x) =>
          x.slice(x.indexOf("/") + 1)
        ),
      ];
      if (!allowed.includes(data.model)) {
        guard.halt(`Model identity drift: ${String(data.model)}`);
        throw new Error(`Model identity drift: ${String(data.model)}`);
      }
      if (
        !usage ||
        !Number.isSafeInteger(usage.prompt_tokens) ||
        usage.prompt_tokens < 0 ||
        !Number.isSafeInteger(usage.completion_tokens) ||
        usage.completion_tokens < 0
      )
        throw new Error("Missing measured token usage");
      if (row.cost_usd === null)
        throw new Error(
          "Unreconciled provider cost; stopping subsequent paid calls"
        );
      row.status = "succeeded";
      row.duration_ms = Date.now() - started;
      await emit(row);
      return data;
    } catch (e) {
      if (globalId !== null) guard.settle(globalId, dispatched ? null : 0);
      if (localId !== null) episodeGuard.settle(localId, dispatched ? null : 0);
      row.status = dispatched ? "failed" : "rejected";
      row.cost_usd = dispatched ? row.cost_usd : 0;
      row.error = String(e.message);
      row.duration_ms = Date.now() - started;
      await emit(row);
      throw e;
    }
  };
}
