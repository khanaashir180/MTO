const VALID_ORDER_TYPES = Object.freeze(['MTO', 'REFURBISHMENT', 'RETURN']);

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCustomerNumber(customerNumber, customerCountryCode = '') {
  const countryDigits = digitsOnly(customerCountryCode);
  let localDigits = digitsOnly(customerNumber);
  if (countryDigits && localDigits.startsWith(countryDigits) && localDigits.length > countryDigits.length) {
    localDigits = localDigits.slice(countryDigits.length);
  }
  localDigits = localDigits.replace(/^0+/, '');
  if (!countryDigits || !localDigits) return '';
  return `+${countryDigits}${localDigits}`;
}

function isValidCustomerName(customerName) {
  const normalized = String(customerName || '').trim();
  const digitCount = (normalized.match(/\d/g) || []).length;
  return Boolean(normalized)
    && /[A-Za-z]/.test(normalized)
    && digitCount <= 3
    && !/\d{4,}/.test(normalized);
}

function normalizeOrderType(orderType, fallback = 'MTO') {
  return String(orderType || fallback).trim().toUpperCase();
}

function isValidOrderType(orderType) {
  return VALID_ORDER_TYPES.includes(normalizeOrderType(orderType, ''));
}

module.exports = {
  VALID_ORDER_TYPES,
  digitsOnly,
  normalizeCustomerNumber,
  isValidCustomerName,
  normalizeOrderType,
  isValidOrderType,
};
