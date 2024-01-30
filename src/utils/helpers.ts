export async function findWithTotalCount(
  model: any,
  query: any,
  pagination: any = null,
) {
  const { page, limit, sort, filter } = pagination;

  const options: {
    limit: number;
    skip: number;
    sort: object;
  } = {
    limit: 50,
    skip: 0,
    sort: { createdAt: sort },
  };

  if (limit > 0 && limit < 50) {
    options.limit = limit;
  }
  options.skip = page && page > 0 ? (page - 1) * options.limit : 0;

  if (sort) {
    options.sort = { createdAt: sort };
  }

  if (filter === 'token') {
    query.collectionAddress = { $eq: null };
  } else if (filter === 'art') {
    query.collectionAddress = { $ne: null };
  }

  const [results, totalCount] = await Promise.all([
    model.find(query, null, options).exec(),
    model.countDocuments(query).exec(),
  ]);
  results.recordsCount = totalCount;

  return results;
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function cleanFloat(input: string) {
  // Check if the input contains a comma and remove it
  input = input.replace(/,/g, '');

  // Regular expression to match and clean the float format with optional trailing zeros and an optional decimal point
  const regex = /^0*(\d+)\.?(\d*?)0*$/;

  // Check if the input matches the regex pattern
  const match = input.match(regex);

  // If there's a match, return the cleaned float, otherwise return "0"
  if (match) {
    const integerPart = match[1];
    const decimalPart = match[2] || '';
    return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
  } else {
    throw new Error('Invalid float to clean');
  }
}

export function isValidNumber(strNum: string) {
  const validNumber = new RegExp(/^\d*\.?\d*$/);
  return validNumber.test('' + strNum);
}

export function formatNumberString(string: string, decimals: number) {
  const pos = string.length - decimals;

  if (decimals == 0) {
    // nothing
  } else if (pos > 0) {
    string =
      string.substring(0, pos) + '.' + string.substring(pos, string.length);
  } else {
    string = '0.' + '0'.repeat(decimals - string.length) + string;
  }

  return string;
}

export function resolveNumberString(number: string, decimals: number) {
  if (!isValidNumber(number)) {
    throw new Error('Invalid op number');
  }

  const splitted = number.split('.');
  if (splitted.length == 1 && decimals > 0) {
    splitted[1] = '';
  }
  if (splitted.length > 1) {
    const size = decimals - splitted[1].length;
    for (let i = 0; i < size; i++) {
      splitted[1] += '0';
    }
    let new_splitted = '';
    for (let i = 0; i < splitted[1].length; i++) {
      if (i >= decimals) {
        break;
      }
      new_splitted += splitted[1][i];
    }
    number = '' + (splitted[0] == '0' ? '' : splitted[0]) + new_splitted;
    if (BigInt(number) == 0n || number === '') {
      number = '0';
    }
  }

  try {
    while (number.charAt(0) === '0') {
      number = number.substring(1);
    }
  } catch (e) {
    number = '0';
  }

  return number === '' ? '0' : number;
}

export function textToHex(text: string | undefined) {
  const encoder = new TextEncoder().encode(text);
  return [...new Uint8Array(encoder)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToString(hex: string) {
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    const hexValue = hex.substring(i, i + 2);
    const decimalValue = parseInt(hexValue, 16);
    str += String.fromCharCode(decimalValue);
  }
  return str;
}

export function hexToBytes(hex: any) {
  return Uint8Array.from(
    hex.match(/.{1,2}/g).map((byte: any) => parseInt(byte, 16)),
  );
}

export function isHex(value: any) {
  return (
    typeof value === 'string' &&
    value.length % 2 === 0 &&
    /[0-9a-fA-F]/.test(value)
  );
}

export function toString26(num: any) {
  const alpha = charRange('a', 'z');
  let result = '';

  // no letters for 0 or less
  if (num < 1) {
    return result;
  }

  let quotient = num,
    remainder;

  // until we have a 0 quotient
  while (quotient !== 0n) {
    // compensate for 0 based array
    const decremented = quotient - 1n;

    // divide by 26
    quotient = decremented / 26n;

    // get remainder
    remainder = decremented % 26n;

    // prepend the letter at index of remainder
    result = alpha[remainder as any] + result;
  }

  return result;
}

export function bitLength(number: bigint) {
  return number === 0n ? 0 : number.toString(2).length;
}

export function byteLength(number: bigint) {
  return Math.ceil(bitLength(number) / 8);
}

export function fromBytes(buffer: any) {
  const bytes = new Uint8Array(buffer);
  const size = bytes.byteLength;
  let x = 0n;
  for (let i = 0; i < size; i++) {
    const byte = BigInt(bytes[i]);
    x = (x << 8n) | byte;
  }
  return x;
}

export function toBytes(number: bigint) {
  if (number < 0n) {
    throw new Error('BigInt must be non-negative');
  }

  if (number === 0n) {
    return new Uint8Array().buffer;
  }

  const size = byteLength(number);
  const bytes = new Uint8Array(size);
  let x = number;
  for (let i = size - 1; i >= 0; i--) {
    bytes[i] = Number(x & 0xffn);
    x >>= 8n;
  }

  return bytes.buffer;
}

export function toInt26(str: string) {
  const alpha = charRange('a', 'z');
  let result = 0n;

  // make sure we have a usable string
  str = str.toLowerCase();
  str = str.replace(/[^a-z]/g, '');

  // we're incrementing j and decrementing i
  let j = 0n;
  for (let i = str.length - 1; i > -1; i--) {
    // get letters in reverse
    const char = str[i];

    // get index in alpha and compensate for
    // 0 based array
    let position = BigInt('' + alpha.indexOf(char));
    position++;

    // the power kinda like the 10's or 100's
    // etc... position of the letter
    // when j is 0 it's 1s
    // when j is 1 it's 10s
    // etc...
    const pow = (base: bigint, exponent: bigint) => base ** exponent;

    const power = pow(26n, j);

    // add the power and index to result
    result += power * position;
    j++;
  }

  return result;
}

export function charRange(start: string, stop: string) {
  const result = [];

  // get all chars from starting char to ending char
  let i = start.charCodeAt(0);
  const last = stop.charCodeAt(0) + 1;
  for (i; i < last; i++) {
    result.push(String.fromCharCode(i));
  }

  return result;
}

export function countDecimals(value: string) {
  const num = value.split('.');
  return num[1] ? num[1].length : 0;
}
