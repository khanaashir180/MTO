const {
  getProductionFlowStages,
  isValidProductionFlow,
  normalizeProductionFlow,
} = require('../src/constants/productionFlows');
const {
  isValidCustomerName,
  isValidOrderType,
  normalizeCustomerNumber,
  normalizeOrderType,
} = require('../src/utils/orderValidation');

describe('order and production validation helpers', () => {
  test('production flow constants preserve MTO routing rules', () => {
    expect(isValidProductionFlow('MTO')).toBe(true);
    expect(isValidProductionFlow('bespoke')).toBe(true);
    expect(isValidProductionFlow('UNKNOWN')).toBe(false);
    expect(normalizeProductionFlow('mto')).toBe('MTO');
    expect(getProductionFlowStages('MTO')).toEqual([
      'Verification',
      'Model Room',
      'Cutting',
      'Closing',
      'Lasting',
      'Finishing',
      'QC',
      'Packing',
    ]);
  });

  test('order type and customer validation reject unsafe pilot inputs', () => {
    expect(normalizeOrderType('refurbishment')).toBe('REFURBISHMENT');
    expect(isValidOrderType('RETURN')).toBe(true);
    expect(isValidOrderType('REMAKE')).toBe(false);
    expect(normalizeCustomerNumber('0300-1234567', '+92')).toBe('+923001234567');
    expect(normalizeCustomerNumber('+923001234567', '+92')).toBe('+923001234567');
    expect(isValidCustomerName('Ali Khan')).toBe(true);
    expect(isValidCustomerName('Customer 12')).toBe(true);
    expect(isValidCustomerName('123456789012')).toBe(false);
    expect(isValidCustomerName('Ali 1234')).toBe(false);
  });
});
