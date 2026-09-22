import {digest,exactCoverage,verifyAttestation} from './evidence-integrity.mjs';
export const REQUIRED_RUNTIME_PROBES=Object.freeze(['model_substitution_rejected','grader_access_denied','receipt_mutation_rejected','interrupted_usage_retained','planned_denominator_preserved','tool_replay_parity','authority_revocation_enforced']);
// The trust store is supplied by the release owner, never read from the submitted
// evidence. A valid signature is an attestation, not proof of reviewer independence.
export function qualifyRuntime(document,{trustedKeys={},runtimeCommit}={}){
 const errors=[];if(!/^[a-f0-9]{40}$/.test(runtimeCommit??''))errors.push('Pinned runtime commit required');
 const probes=document?.probes??[];errors.push(...exactCoverage(REQUIRED_RUNTIME_PROBES,probes.map(p=>p.name),'runtime probes'));
 for(const p of probes){if(p.passed!==true||p.clean_control_passed!==true||p.fault_injected!==true||typeof p.command!=='string'||!/^sha256:[a-f0-9]{64}$/.test(p.raw_receipt_digest??''))errors.push(`Executable positive and negative evidence missing for ${p.name}`);}
 const binding={runtime_commit:runtimeCommit,probe_digest:digest(probes),evidence_kind:'isolated_runtime_execution'};
 const attestation=verifyAttestation(document?.attestation,{trustedKeys,expectedBinding:binding,requiredRole:'runtime_auditor'});if(!attestation.ok)errors.push(attestation.error);
 return {ok:errors.length===0,errors,runtime_commit:runtimeCommit,probe_count:probes.length,source_inventory_is_not_qualification:true};
}
