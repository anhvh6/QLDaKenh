const paths={
 grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 calendar:'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M7 14h2 M12 14h2 M17 14h1 M7 18h2 M12 18h2',
 edit:'M12 20H4V4h10 M16 3l5 5-10 10-5 1 1-5z',
 image:'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1 M3 16l5-5 5 5 3-3 5 5 M15 7h.01',
 inbox:'M4 4h16l2 10v6H2v-6z M2 14h6l2 3h4l2-3h6',
 users:'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M16 3a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-4-4 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
 box:'M12 3l9 5v10l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v10 M7 5l10 6',
 bag:'M5 7h14l2 14H3z M8 8V6a4 4 0 0 1 8 0v2',
 truck:'M1 4h14v13H1z M15 9h4l3 4v4h-7 M5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M18 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
 spark:'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z M20 2v4 M18 4h4',
 chart:'M3 3v18h18 M7 15v-4 M12 15V7 M17 15v-7',
 settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
 plus:'M12 5v14 M5 12h14',search:'M21 21l-5-5 M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
 down:'M6 9l6 6 6-6',right:'M9 5l7 7-7 7',left:'M15 5l-7 7 7 7',close:'M6 6l12 12 M6 18L18 6',check:'M5 12l4 4L19 6',clock:'M12 8v5l3 2 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
 arrow:'M7 17L17 7 M7 7h10v10',more:'M5 12h.01 M12 12h.01 M19 12h.01',send:'M22 2L9 15 M22 2l-7 20-6-7-7-6z',link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-3 3 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l3-3',
 upload:'M12 16V3 M7 8l5-5 5 5 M3 16v5h18v-5',download:'M12 3v13 M7 11l5 5 5-5 M3 17v4h18v-4',logout:'M9 3H3v18h6 M13 7l5 5-5 5 M8 12h13',menu:'M3 6h18 M3 12h18 M3 18h18',play:'M8 4l12 8-12 8z',filter:'M3 5h18 M6 12h12 M10 19h4',copy:'M8 8h13v13H8z M16 8V3H3v13h5',trash:'M3 6h18 M5 6l1 15h12l1-15 M9 6V3h6v3 M10 10v7 M14 10v7',help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4 M12 18h.01 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',checklist:'M9 5h12 M9 12h12 M9 19h12 M2 5l2 2 3-4 M2 12l2 2 3-4 M2 19l2 2 3-4',refresh:'M20 7V2l-4 4 M20 7A8 8 0 1 0 21 15',lock:'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4',heart:'M12 21L3 12a5 5 0 0 1 9-7 5 5 0 0 1 9 7z',note:'M4 3h16v18H4z M8 7h8 M8 11h8 M8 15h5',wallet:'M3 5h17v15H3z M15 10h7v6h-7z M4 5V2h14',globe:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M2 12h20 M12 2c6 6 6 14 0 20-6-6-6-14 0-20'};
export const icon=(name,size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;
