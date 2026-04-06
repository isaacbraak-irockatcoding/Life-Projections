/* ══════════════════════════════════════════════
   data.js — Static constants and lookup tables
══════════════════════════════════════════════ */

const JOBS = [
  { id: 'sw_eng',      name: 'Software Engineer', s0: 95000,  s35: 195000, s50: 220000 },
  { id: 'nurse',       name: 'Registered Nurse',  s0: 72000,  s35: 115000, s50: 128000 },
  { id: 'electrician', name: 'Electrician',        s0: 55000,  s35: 95000,  s50: 106000 },
  { id: 'acc',         name: 'Accountant',         s0: 65000,  s35: 140000, s50: 158000 },
  { id: 'teacher',     name: 'Teacher',            s0: 44000,  s35: 74000,  s50: 80000  },
  { id: 'doctor',      name: 'Physician',          s0: 120000, s35: 280000, s50: 315000 },
  { id: 'plumber',     name: 'Plumber',            s0: 52000,  s35: 90000,  s50: 100000 },
  { id: 'designer',    name: 'UX Designer',        s0: 78000,  s35: 150000, s50: 168000 },
  { id: 'lawyer',      name: 'Lawyer',             s0: 80000,  s35: 210000, s50: 250000 },
  { id: 'custom',      name: '✏️ Custom Salary',   s0: 60000,  s35: 100000, s50: 115000 },
];

const PATH_COLORS = ['#00d4aa', '#a78bfa', '#f0a040', '#38bdf8', '#f472b6', '#34d399'];
const EVENT_COLORS = ['#38bdf8', '#f472b6', '#34d399', '#fb923c', '#e879f9', '#f87171'];
const AVATARS = ['🦊', '🚀', '💎', '🌊', '✨', '🍀', '🦁', '🎯', '🐋', '🪐'];

const EVENT_TYPES = [
  { id: 'house_purchase', label: 'House Purchase', emoji: '🏠', defaultCost: 60000, defaultAnnual: -18000, defaultYears: 30, defaultHomeValue: 400000, defaultAppreciationRate: 3 },
{ id: 'inheritance',    label: 'Inheritance',    emoji: '💰', defaultCost: -50000, defaultAnnual: 0,     defaultYears: 1  },
  { id: 'marriage',       label: 'Marriage',       emoji: '💍', defaultCost: 25000, defaultAnnual: 0,      defaultYears: 1  },
  { id: 'children',       label: 'Children',       emoji: '👶', defaultCost: 15000, defaultAnnual: -10000, defaultYears: 18 },
  { id: 'job_change',     label: 'Job Change',     emoji: '💼', defaultCost: 0,     defaultAnnual: 0,      defaultYears: 1  },
  { id: 'custom',         label: 'Custom',         emoji: '📌', defaultCost: 0,     defaultAnnual: 0,      defaultYears: 1  },
];

const ASSET_TYPES = [
  { id: '401k',        label: '401(k)' },
  { id: 'roth_ira',    label: 'Roth IRA' },
  { id: 'brokerage',   label: 'Brokerage' },
  { id: 'real_estate', label: 'Real Estate' },
  { id: 'cash',        label: 'Cash / Savings' },
  { id: 'other',       label: 'Other Asset' },
];

const DEBT_TYPES = [
  { id: 'student_loan',  label: 'Student Loan' },
  { id: 'mortgage',      label: 'Mortgage' },
  { id: 'auto',          label: 'Auto Loan' },
  { id: 'credit_card',   label: 'Credit Card' },
  { id: 'other',         label: 'Other Debt' },
];
