import {cn} from './cn';
import {formatMultiplier,outlierBand,type OutlierBand} from '../outlier';

const bands:Record<OutlierBand,string>={
 grey:'bg-band-grey-soft text-band-grey',
 blue:'bg-band-blue-soft text-band-blue',
 green:'bg-band-green-soft text-band-green',
 amber:'bg-band-amber-soft text-band-amber',
 orange:'bg-band-orange-soft text-band-orange',
 red:'bg-band-red-soft text-band-red',
};

/** A video's views over its channel's median, coloured by Eden's bands: "2.84×", "23×", or "2.84× usual views" with a label. Renders nothing without a number. */
export function OutlierChip({multiplier,label,className}:{multiplier:number;label?:string;className?:string}){
 if(!Number.isFinite(multiplier)||multiplier<0)return null;
 const band=outlierBand(multiplier);
 return <span data-band={band} className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2.5 font-sans text-xs font-semibold whitespace-nowrap tabular-nums',bands[band],className)}>{formatMultiplier(multiplier)}{label&&<span className="font-medium">{label}</span>}</span>;
}
