const PRODUCTION_FLOW_STAGES = Object.freeze({
  BESPOKE: Object.freeze(['Verification', 'Bespoke', 'Model Room', 'Cutting', 'Closing', 'Sole', 'Lasting', 'Finishing', 'QC', 'Packing']),
  EMBROIDERY: Object.freeze(['Verification', 'Embroidery', 'Closing', 'Sole', 'Lasting', 'Finishing', 'QC', 'Packing']),
  LASER: Object.freeze(['Verification', 'Laser', 'Closing', 'Sole', 'Lasting', 'Finishing', 'QC', 'Packing']),
  MTO: Object.freeze(['Verification', 'Model Room', 'Cutting', 'Closing', 'Lasting', 'Finishing', 'QC', 'Packing']),
});

const PRODUCTION_FLOWS = Object.freeze(Object.keys(PRODUCTION_FLOW_STAGES));

function normalizeProductionFlow(flow, fallback = 'BESPOKE') {
  const value = String(flow || fallback).trim().toUpperCase();
  return PRODUCTION_FLOW_STAGES[value] ? value : fallback;
}

function isValidProductionFlow(flow) {
  return PRODUCTION_FLOWS.includes(String(flow || '').trim().toUpperCase());
}

function getProductionFlowStages(flow) {
  return PRODUCTION_FLOW_STAGES[normalizeProductionFlow(flow)] || PRODUCTION_FLOW_STAGES.BESPOKE;
}

module.exports = {
  PRODUCTION_FLOW_STAGES,
  PRODUCTION_FLOWS,
  normalizeProductionFlow,
  isValidProductionFlow,
  getProductionFlowStages,
};
