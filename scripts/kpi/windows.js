// windows.js — Single source for time-window math. Every dashboard query
// gets its date bounds from here. All windows are UTC.

'use strict';

const { LAUNCH_TIMESTAMP } = require('./schema');

// ── Helpers ────────────────────────────────────────────────────────────
function startOfDayUTC(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toIso(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function todayWindow(now = new Date()) {
  const start = startOfDayUTC(now);
  const end = addDays(start, 1);
  return {
    label: 'today',
    startIso: toIso(start),
    endIso: toIso(end),
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    days: 1,
  };
}

function yesterdayWindow(now = new Date()) {
  const start = addDays(startOfDayUTC(now), -1);
  const end = addDays(start, 1);
  return {
    label: 'yesterday',
    startIso: toIso(start),
    endIso: toIso(end),
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    days: 1,
  };
}

function rollingWindow(days, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);
  return {
    label: `last ${days}d`,
    startIso: toIso(start),
    endIso: toIso(end),
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    days,
  };
}

// Since the beginning of time (no launch date yet — all-time)
function allTimeWindow(now = new Date()) {
  const start = new Date('2026-01-01T00:00:00Z'); // conservative floor
  const end = new Date(now);
  return {
    label: 'all-time',
    startIso: toIso(start),
    endIso: toIso(end),
    startDate: '2026-01-01',
    endDate: toIsoDate(end),
    days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
  };
}

// Since the app went live on the App Store. This is the reporting baseline —
// anything before LAUNCH_TIMESTAMP is TestFlight/pre-launch and excluded.
function sinceLaunchWindow(now = new Date()) {
  const start = new Date(LAUNCH_TIMESTAMP);
  const end = new Date(now);
  return {
    label: 'since launch',
    startIso: toIso(start),
    endIso: toIso(end),
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    days: Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24))),
  };
}

function standardWindows(now = new Date()) {
  return {
    today: todayWindow(now),
    yesterday: yesterdayWindow(now),
    last7d: rollingWindow(7, now),
    last28d: rollingWindow(28, now),
    allTime: allTimeWindow(now),
    sinceLaunch: sinceLaunchWindow(now),
  };
}

module.exports = {
  startOfDayUTC,
  addDays,
  toIso,
  toIsoDate,
  todayWindow,
  yesterdayWindow,
  rollingWindow,
  allTimeWindow,
  sinceLaunchWindow,
  standardWindows,
};
