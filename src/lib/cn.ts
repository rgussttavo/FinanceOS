import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** junta classes e deixa a ultima vencer quando duas mexem na mesma propriedade */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
