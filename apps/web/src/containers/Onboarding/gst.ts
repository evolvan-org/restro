import { GSTIN_PATTERN } from '@rms/api-contract';

/** GST state and union territory codes (the first two digits of a GSTIN). */
const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

export type GstinCheck =
  | { status: 'empty' }
  | { status: 'valid'; stateCode: string; state: string }
  | { status: 'invalid'; message: string };

export function checkGstin(value: string): GstinCheck {
  const gstin = value.trim().toUpperCase();
  if (!gstin) return { status: 'empty' };
  if (gstin.length !== 15) {
    return { status: 'invalid', message: `A GSTIN has 15 characters (${gstin.length} entered)` };
  }
  if (!GSTIN_PATTERN.test(gstin)) return { status: 'invalid', message: 'Check the GSTIN format' };
  const stateCode = gstin.slice(0, 2);
  const state = GST_STATES[stateCode];
  if (!state) return { status: 'invalid', message: `${stateCode} isn't a GST state code` };
  return { status: 'valid', stateCode, state };
}
