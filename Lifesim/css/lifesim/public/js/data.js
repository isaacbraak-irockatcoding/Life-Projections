/* ══════════════════════════════════════════════
   data.js — Static constants and lookup tables
   To add a new job: copy any entry and add it
   to the JOBS array below.
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
    { id: 'custom',      name: '✏️ Custom Salary',  s0: 60000,  s35: 100000, s50: 115000 },
  ];
  
  // Colors assigned to Path A, B, C in order
  const PATH_COLORS = ['#00d4aa', '#a78bfa', '#f0a040'];
  const PATH_LABELS = ['Path A', 'Path B', 'Path C'];
  
  // Colors cycled through for life events
  const EVENT_COLORS = ['#38bdf8', '#f472b6', '#34d399', '#fb923c', '#e879f9', '#f87171'];
  
  // Avatars shown on the onboarding screen
  const AVATARS = ['🦊', '🚀', '💎', '🌊', '✨', '🍀', '🦁', '🎯', '🐋', '🪐'];