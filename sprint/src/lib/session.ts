// Which chart this sprint's votes count for. A link from a workshop carries its
// room code (?code=ABCD); with none, votes go to the standing chart for everyone.
const fromLink = new URLSearchParams(location.search).get('code');
export const SESSION_CODE = (fromLink || 'OPEN').toUpperCase();
export const HAS_ROOM = Boolean(fromLink);

/** The other pages of the site, carrying the room code along. */
const withCode = (page: string) => (HAS_ROOM ? `${page}?code=${encodeURIComponent(SESSION_CODE)}` : page);
export const TRY_IT_URL = withCode('../');
export const CHART_URL = `../projector.html?code=${encodeURIComponent(SESSION_CODE)}`;
export const WORKSHOP_URL = 'https://wmgmm.github.io/thematts/workshop.html';

/** The emailed link (share.html) opens the "Tell us how you use AI" card on its own:
 *  no sprint, no prompts, nothing else to do. */
export const SHARE_ONLY = new URLSearchParams(location.search).has('share');
