// Which days meals are logged for, shared with the app, so that Bite offers the days the app does.
// This file imports nothing, so that the app can bundle it.

/**
 * How many days before today a meal may be logged: a mirror of check_meal_day() in the database
 * (migration 20261027160000_create_meal_entries.sql), which must change with it. The database
 * decides (BB020), allowing a day more on each side for the server's day; these only spare asking
 * it for a day it would refuse (ADR 0034).
 */
export const LOGGABLE_DAYS = 7;
