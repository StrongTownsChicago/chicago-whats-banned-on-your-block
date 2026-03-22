/**
 * adu-ward-data.js — ADU ordinance ward opt-in data.
 *
 * Source: adu_optin_info.js (converted from Python syntax to valid ES module).
 * Keys are ward numbers (numeric literals). JS auto-coerces numeric keys when
 * accessed via wardOptInData[wardNumber] where wardNumber is a Number.
 *
 * Fields:
 *   type          — "full" | "partial" | "not_eligible"
 *   block_limits  — boolean: block-level unit caps apply
 *   homeowner_req — boolean: owner-occupancy required
 *   admin_adj     — boolean: administrative adjustment may be required
 *   notes         — string | undefined: ward-specific clarification
 */

export const WARD_OPT_IN_INFO = {
  1: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  3: {
    type: "not_eligible",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
    notes: "not eligible (no SFH zoning to opt-in)",
  },
  4: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  5: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  6: {
    type: "full",
    notes: "Whole ward (including the part currently in the pilot)",
    block_limits: true,
    homeowner_req: true,
    admin_adj: true,
  },
  12: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  14: {
    type: "partial",
    notes: "Partial. Only precincts 1, 4, 9, and 15",
    block_limits: true,
    homeowner_req: true,
    admin_adj: true,
  },
  22: {
    type: "full",
    block_limits: true,
    homeowner_req: true,
    admin_adj: true,
  },
  25: {
    type: "full",
    block_limits: true,
    homeowner_req: true,
    admin_adj: true,
  },
  26: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  27: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  29: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  30: {
    type: "partial",
    notes: "Partial. Whole ward except for precincts 1, 4, 9, and 21.",
    block_limits: true,
    homeowner_req: true,
    admin_adj: true,
  },
  31: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  32: {
    type: "full",
    block_limits: true,
    homeowner_req: true,
    admin_adj: true,
  },
  33: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  34: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  35: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  36: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  40: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  42: {
    type: "not_eligible",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
    notes: "not eligible (no SFH zoning to opt-in)",
  },
  43: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  44: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  46: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  47: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  48: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
  49: {
    type: "full",
    block_limits: false,
    homeowner_req: false,
    admin_adj: false,
  },
};
