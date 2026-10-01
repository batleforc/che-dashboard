/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

export const KI = 1024;
export const MI = KI * 1024;
export const GI = MI * 1024;
export const TI = GI * 1024;

const MULTIPLIERS: Record<string, number> = {
  '': 1,
  Ki: KI,
  Mi: MI,
  Gi: GI,
  Ti: TI,
  Pi: TI * 1024,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
};

const QUANTITY_REGEX = /^(\d+(?:\.\d+)?|\.\d+)(Ki|Mi|Gi|Ti|Pi|k|M|G|T|P)?$/;

/**
 * Parses a Kubernetes storage quantity (e.g. `10Gi`, `500M`, `1073741824`) into bytes.
 * Binary (`Ki Mi Gi Ti Pi`) and decimal (`k M G T P`) suffixes are supported.
 * Fractional byte values are rounded up, as Kubernetes does.
 * @throws Error if the quantity is empty, negative or malformed
 */
export function parseQuantity(quantity: string): number {
  const match = QUANTITY_REGEX.exec((quantity ?? '').trim());
  if (match === null) {
    throw new Error(`Invalid quantity: "${quantity}"`);
  }
  const [, value, suffix = ''] = match;
  return Math.ceil(parseFloat(value) * MULTIPLIERS[suffix]);
}

/**
 * Returns `true` if the value is a valid storage quantity.
 */
export function isValidQuantity(quantity: string): boolean {
  try {
    parseQuantity(quantity);
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats bytes as a Kubernetes quantity in gibibytes, e.g. `10Gi` or `4.7Gi`.
 * The result can be parsed back with `parseQuantity`.
 * @param bytes the value to format
 * @param fractionDigits the maximum number of decimals (trailing zeros are dropped)
 */
export function formatGi(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes)) {
    throw new Error(`Invalid number of bytes: ${bytes}`);
  }
  const value = parseFloat((bytes / GI).toFixed(fractionDigits));
  return `${value}Gi`;
}
