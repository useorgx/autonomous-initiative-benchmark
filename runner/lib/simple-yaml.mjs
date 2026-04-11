export function parseSimpleYaml(source) {
  const lines = source.replace(/\t/g, '  ').split(/\r?\n/);
  const root = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith('#')) {
      index += 1;
      continue;
    }

    const indent = countIndent(line);
    if (indent !== 0) {
      index += 1;
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      index += 1;
      continue;
    }

    const [, key, rawValue = ''] = match;
    const value = rawValue.trimEnd();
    if (value === '|' || value === '>') {
      const block = readBlock(lines, index + 1, indent, value === '>');
      root[key] = block.value;
      index = block.nextIndex;
      continue;
    }

    if (value === '') {
      const parsed = parseNested(lines, index + 1, indent);
      root[key] = parsed.value;
      index = parsed.nextIndex;
      continue;
    }

    root[key] = parseScalar(value);
    index += 1;
  }

  root.acceptanceCriteria = root.acceptanceCriteria ?? [];
  return root;
}

function parseNested(lines, startIndex, parentIndent) {
  let index = skipEmpty(lines, startIndex);
  if (index >= lines.length || countIndent(lines[index]) <= parentIndent) {
    return { value: null, nextIndex: index };
  }

  if (lines[index].trimStart().startsWith('- ')) {
    return parseArray(lines, index, countIndent(lines[index]));
  }

  return parseMap(lines, index, countIndent(lines[index]));
}

function parseArray(lines, startIndex, itemIndent) {
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const indent = countIndent(line);
    const trimmed = line.trimStart();
    if (indent < itemIndent || !trimmed.startsWith('- ')) break;

    const itemText = trimmed.slice(2).trimEnd();
    if (!itemText.includes(':')) {
      items.push(parseScalar(itemText));
      index += 1;
      continue;
    }

    const parsed = parseObjectArrayItem(lines, index, itemIndent, itemText);
    items.push(parsed.value);
    index = parsed.nextIndex;
  }

  return { value: items, nextIndex: index };
}

function parseObjectArrayItem(lines, startIndex, itemIndent, itemText) {
  const object = {};
  const inline = itemText.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
  if (inline) {
    const [, key, rawValue = ''] = inline;
    object[key] = parseScalar(rawValue.trim());
  }

  let index = startIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const indent = countIndent(line);
    if (indent <= itemIndent) break;

    const match = line.trimStart().match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      index += 1;
      continue;
    }

    const [, key, rawValue = ''] = match;
    const value = rawValue.trimEnd();
    if (value === '|' || value === '>') {
      const block = readBlock(lines, index + 1, indent, value === '>');
      object[key] = block.value;
      index = block.nextIndex;
    } else if (value === '') {
      const parsed = parseNested(lines, index + 1, indent);
      object[key] = parsed.value;
      index = parsed.nextIndex;
    } else {
      object[key] = parseScalar(value);
      index += 1;
    }
  }

  return { value: object, nextIndex: index };
}

function parseMap(lines, startIndex, keyIndent) {
  const object = {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const indent = countIndent(line);
    if (indent < keyIndent) break;
    if (indent > keyIndent) {
      index += 1;
      continue;
    }

    const match = line.trimStart().match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) break;

    const [, key, rawValue = ''] = match;
    const value = rawValue.trimEnd();
    if (value === '|' || value === '>') {
      const block = readBlock(lines, index + 1, indent, value === '>');
      object[key] = block.value;
      index = block.nextIndex;
    } else if (value === '') {
      const parsed = parseNested(lines, index + 1, indent);
      object[key] = parsed.value;
      index = parsed.nextIndex;
    } else {
      object[key] = parseScalar(value);
      index += 1;
    }
  }

  return { value: object, nextIndex: index };
}

function readBlock(lines, startIndex, parentIndent, folded) {
  const blockLines = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      blockLines.push('');
      index += 1;
      continue;
    }
    if (countIndent(line) <= parentIndent) break;
    blockLines.push(line.slice(parentIndent + 2));
    index += 1;
  }

  const value = folded ? foldBlock(blockLines) : blockLines.join('\n').trimEnd();
  return { value, nextIndex: index };
}

function foldBlock(lines) {
  return lines
    .join('\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, ' ').trim())
    .join('\n\n')
    .trimEnd();
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function countIndent(line) {
  return line.match(/^ */)?.[0].length ?? 0;
}

function skipEmpty(lines, startIndex) {
  let index = startIndex;
  while (index < lines.length && !lines[index].trim()) index += 1;
  return index;
}
