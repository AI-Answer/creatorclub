/**
 * Stand-in for the video store until Task 2 adds `shared/club.ts` and `/api/club/*`.
 * Only the placeholder screens read this; delete it when they read real videos.
 */
export type MockVideo={id:string;title:string;recorderProjectId?:string};

export const exampleVideo:MockVideo={id:'example',title:'Hidden features in Claude Code'};

export function findMockVideo(id:string):MockVideo|undefined{return id===exampleVideo.id?exampleVideo:undefined;}
