export type Level = "district" | "region" | "department" | "sub_prefecture" | "commune";
export type Confidence = "official" | "derived";

export interface Region {
  code: string;
  name: string;
  level: Level;
  parent: string | null;
  capital?: string | null;
  lat?: number | null;
  lng?: number | null;
  area_km2?: number | null;
  population?: number | null;
  confidence: Confidence;
  source: string;
}

export interface Holiday {
  id: string;
  name_fr: string;
  name_en: string;
  type: "fixed" | "movable_christian" | "movable_islamic";
  confidence: Confidence;
  date: string | null;
}

export type PrefixKind = "operator_mobile" | "operator_landline" | "geographic_zone" | "service";

export interface PhonePrefix {
  id: string;
  kind: PrefixKind;
  prefixes: string[];
  operator?: string;
  zone?: string;
  service?: string;
  source: string;
}

export interface RegionFilters { level?: Level; parent?: string | null; q?: string; capital?: string; }

export const LEVELS: Level[];
export function getRegions(opts?: RegionFilters): Region[];
export function getDistricts(): Region[];
export function getRegion(code: string): Region | null;
export function getChildren(code: string): Region[];
export function getPath(code: string): Region[] | null;
/** Communes situées sous un district, une région ou un département. */
export function getCommunes(parentCode: string): Region[];
export function descendantsOf(code: string, level?: Level): Region[];
export function getHolidays(year?: number | string): Holiday[];
export function isHoliday(date: string | Date): Holiday | null;
export function getPhonePrefixes(opts?: { kind?: PrefixKind; operator?: string }): PhonePrefix[];
/** 0711223344 / +225 07 11 22 33 44 / 2120345678 → entrée de numérotation. */
export function resolvePhone(number: string): (PhonePrefix & { number: string; matched: string }) | null;
