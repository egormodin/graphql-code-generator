interface ObjectValue {
  value: string | Record<string, ObjectValue>;
  arrayValue?: boolean;
  objectValue?: boolean;
}

export function buildObjectTree(object: string): Record<string, ObjectValue> {
  let orObject = '';
  [object, orObject] = findClosing(object, '{', '}');

  const obj: Record<string, ObjectValue> = {};

  object = object.trim().slice(1, -1).trim();

  while (object) {
    let [key, value] = object.split(/:(.*)/s);
    key = key.trim();
    value = value.trim();

    if (value.startsWith('Array')) {
      [value, object] = findClosing(value.slice(5), '<', '>');
      value = value.trim().slice(1, -1).trim();
      obj[key] = {
        value: value.startsWith('{') ? buildObjectTree(value) : value,
        arrayValue: true,
        objectValue: value.startsWith('{'),
      };
      if (object.startsWith(',')) {
        object = object.slice(1);
      }
    } else if (value.startsWith('{')) {
      [value, object] = findClosing(value, '{', '}', true);
      object = object.slice(1).trim();
      obj[key] = {
        value: buildObjectTree(value),
        objectValue: true,
      };
    } else {
      [value, object] = value.split(/,(.*)/s);
      value = value.trim();
      obj[key] = {
        value: /'\w+'/.test(value) ? 'string' : value,
      };
    }

    object = object?.trim();
  }

  if (orObject?.startsWith(' | ')) {
    return mergeObjects(obj, buildObjectTree(orObject.slice(3)));
  }
  return obj;
}

export function findClosing(value: string, opening: string, closing: string, multiple = false): [string, string] {
  const stack = [opening];
  let index = 1;

  while (stack.length > 0 && index < value.length) {
    if (value[index] === opening) {
      stack.push(opening);
    } else if (value[index] === closing) {
      stack.pop();
    }
    index++;

    if (stack.length === 0 && multiple && value.slice(index).startsWith(' | ')) {
      stack.push(opening);
      index += 4;
    }
  }

  return [value.slice(0, index), value.slice(index)];
}

export function mergeObjects(
  obj1: Record<string, ObjectValue>,
  obj2: Record<string, ObjectValue>
): Record<string, ObjectValue> {
  const obj: Record<string, ObjectValue> = {};
  const keys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

  for (const key of keys) {
    obj[key] = obj1[key] || obj2[key];
    if (obj[key].objectValue) {
      obj[key] = {
        value: mergeObjects(
          (obj1[key]?.value || {}) as Record<string, ObjectValue>,
          (obj2[key]?.value || {}) as Record<string, ObjectValue>
        ),
        arrayValue: obj[key].arrayValue,
        objectValue: obj[key].objectValue,
      };
    }
  }

  return obj;
}

export function convertToType(obj: Record<string, ObjectValue>, tab = 1): string {
  let stringObj = '';
  for (const [key, objectValue] of Object.entries(obj)) {
    let value = '';
    if (objectValue.objectValue) {
      value = convertToType(objectValue.value as Record<string, ObjectValue>, tab + 1);
    } else {
      value = objectValue.value as string;
    }
    if (objectValue.arrayValue) {
      value = `Array<${value}>`;
    }
    stringObj += `${' '.repeat(tab * 2)}${key}: ${value},\n`;
  }

  return `{\n${stringObj}${' '.repeat((tab - 1) * 2)}}`;
}

export function capitalize(text: string): string {
  return text[0].toUpperCase() + text.slice(1);
}
