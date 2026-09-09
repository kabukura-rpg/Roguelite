import { isPolicy } from '../lib/game/portfolio.ts';
import { INCIDENTS } from '../lib/game/incidents.ts';
import { reducer, type State } from '../lib/game/engine.ts';
import type { Decision } from '../lib/game/data.ts';
export function handleIncident(s: State, shock: Decision = 'hold'): State {
  if (s.phase === 'incidentResult')
    return reducer(s, { type: 'INCIDENT_NEXT' });
  const event = INCIDENTS.find((e) => e.id === s.currentIncident)!;
  return reducer(s, {
    type: 'INCIDENT_CHOICE',
    choiceId:
      event.kind === 'shock'
        ? shock
        : event.kind === 'life'
          ? 'pay'
          : event.choices!.find((c) => !c.cost)!.id,
  });
}

export function handleGrowth(s: State): State {
  return reducer(s, {
    type: 'GROWTH',
    choiceId: s.growthChoices.find(isPolicy) ?? s.growthChoices[0],
  });
}
