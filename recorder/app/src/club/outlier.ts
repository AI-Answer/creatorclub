/** Eden's outlier bands: grey under 1×, blue 1–3×, green 3–5×, amber 5–10×, orange 10–50×, red 50× and up. */
export type OutlierBand='grey'|'blue'|'green'|'amber'|'orange'|'red';

export function outlierBand(multiplier:number):OutlierBand{
 if(!(multiplier>=1))return 'grey';
 if(multiplier<3)return 'blue';
 if(multiplier<5)return 'green';
 if(multiplier<10)return 'amber';
 if(multiplier<50)return 'orange';
 return 'red';
}

/** Two decimals under 10×, rounded from 10× up: "2.84×", "23×". */
export function formatMultiplier(multiplier:number):string{
 return multiplier<10?`${multiplier.toFixed(2)}×`:`${Math.round(multiplier)}×`;
}
