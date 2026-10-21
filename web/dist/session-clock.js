// Older sessions start at createdAt; resumed sessions accumulate only running time.
export function elapsedMs(session, now=Date.now()) {
  const start=Date.parse(session.timerStartedAt||session.createdAt);
  const end=session.endedAt?Date.parse(session.endedAt):now;
  return (session.accumulatedMs||0)+Math.max(0,end-start);
}
export function endSession(session, now=Date.now()) {
  if(session.endedAt)return false;
  session.endedAt=new Date(now).toISOString();
  return true;
}
export function resumeSession(session, now=Date.now()) {
  if(!session.endedAt)return false;
  session.accumulatedMs=elapsedMs(session,now);
  session.timerStartedAt=new Date(now).toISOString();
  session.endedAt=null;
  return true;
}
export function formatElapsed(ms) {
  const n=Math.floor(ms/1000);
  return `${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;
}
