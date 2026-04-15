import fs from 'fs';
import path from 'path';

const logoSvg = fs.readFileSync(path.join(process.cwd(), 'public', 'logo.svg'), 'utf-8');
export const logoUrl = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;
export const logoWidth = 180;
export const logoHeight = Math.round(180 * (1803 / 5982)); // 54px based on viewBox
