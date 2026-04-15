/** 28-field schema returned by extract API (JSON keys). */
export type DcipsExtracted = {
  Field_Report_Type: string;
  Field_Report_Number: string;
  Last_Name: string;
  First_Name: string;
  Middle_Name: string;
  Suffix: string;
  Inflicting_Force: string;
  Casualty_Type_Status_Category: string;
  SSN: string;
  DoD_ID: string;
  Personnel_Type: string;
  Branch_of_Service: string;
  Rank: string;
  Military_Unit: string;
  UIC: string;
  Duty_Status: string;
  Incident_Date_Time: string;
  Country: string;
  State: string;
  Grid: string;
  Operation: string;
  Circumstances: string;
  Date_of_Death_Time: string;
  Death_Country: string;
  Death_State: string;
  Birth_Date: string;
  Gender: string;
  Remarks: string;
};

export const EMPTY_DCIPS: DcipsExtracted = {
  Field_Report_Type: "",
  Field_Report_Number: "",
  Last_Name: "",
  First_Name: "",
  Middle_Name: "",
  Suffix: "",
  Inflicting_Force: "",
  Casualty_Type_Status_Category: "",
  SSN: "",
  DoD_ID: "",
  Personnel_Type: "",
  Branch_of_Service: "",
  Rank: "",
  Military_Unit: "",
  UIC: "",
  Duty_Status: "",
  Incident_Date_Time: "",
  Country: "",
  State: "",
  Grid: "",
  Operation: "",
  Circumstances: "",
  Date_of_Death_Time: "",
  Death_Country: "",
  Death_State: "",
  Birth_Date: "",
  Gender: "",
  Remarks: "",
};

export const DCIPS_KEYS = Object.keys(EMPTY_DCIPS) as (keyof DcipsExtracted)[];

/** API response: one or more casualty records from /api/extract */
export type DcipsExtractResponse = {
  personnel: DcipsExtracted[];
};

/** User-chosen spreadsheet / extraction mode (sent with each extract request). */
export type ReportFormat = "individual" | "multiple";
