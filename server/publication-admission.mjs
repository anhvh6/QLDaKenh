// Process-local evidence that a scheduled job was observed on time. Never restored
// after a restart: missed jobs still require an explicit new schedule.
const admitted = new Map();
export function observeDuePublications(publications, time = Date.now()) {
  const scheduled = new Map(publications.filter(p => p.status === 'scheduled').map(p => [p.id, p]));
  for (const [id, entry] of admitted) if (scheduled.get(id)?.scheduleAt !== entry.scheduleAt) admitted.delete(id);
  for (const p of scheduled.values()) {
    const slot = Date.parse(p.scheduleAt);
    if (time >= slot && time <= slot + 60000 && !admitted.has(p.id)) admitted.set(p.id, {scheduleAt:p.scheduleAt, observedAt:time});
  }
}
export function publicationAdmissionTime(publication) {
  const entry = admitted.get(publication.id);
  return entry?.scheduleAt === publication.scheduleAt ? entry.observedAt : undefined;
}
