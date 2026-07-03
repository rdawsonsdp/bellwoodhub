// Build-time live-pilot signal for client components (RD directive: live surfaces
// must be real or honestly empty — never fictional). NEXT_PUBLIC_LIVE=1 is set ONLY
// on the pilot Preview env; production demo builds inline false. Server code keeps lib/demo.
export const IS_LIVE_BUILD = process.env.NEXT_PUBLIC_LIVE === "1";
