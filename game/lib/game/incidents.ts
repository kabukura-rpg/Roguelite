import type { CardId } from './cards.ts';

export type IncidentChoice = {
  id: string;
  label: string;
  hint: string;
  cost?: number;
  gain?: number;
  card?: CardId;
  insight?: boolean;
  shield?: boolean;
  gamble?: boolean;
};
export type Incident = {
  id: string;
  kind: 'shock' | 'life' | 'chance';
  name: string;
  description: string;
  cost?: number;
  range?: [number, number];
  choices?: IncidentChoice[];
};
export const INCIDENT_RULES = { probability: 0.3, minimum: 4, turns: 20 };
export const INCIDENTS: Incident[] = [
  {
    id: 'credit',
    kind: 'shock',
    name: '信用不安の連鎖',
    description:
      '大手企業の資金繰り悪化が報じられた。株式には売り圧力。安全資産も無傷とは限らない。現金化は守りになるが、売った分の反発は逃す。',
    range: [-0.2, -0.08],
  },
  {
    id: 'policy',
    kind: 'shock',
    name: '緊急政策発表',
    description:
      '予想外の政策が発表され、市場が激しく反応している。混乱が続く可能性も、安心感から買い戻される可能性もある。追加投資は両方の振れを大きくする。',
    range: [-0.12, 0.1],
  },
  {
    id: 'flash',
    kind: 'shock',
    name: '薄商いの急変',
    description:
      '取引の少ない時間に大量の売り注文。急落後の買い戻しも見られるが、底打ちは確認できない。余裕資金を残すか、反発に賭けるか。',
    range: [-0.16, 0.06],
  },
  ...(
    [
      [
        'injury',
        '怪我の治療',
        '転倒して通院が必要に。治療費と交通費を支払う。',
        60000,
      ],
      [
        'appliance',
        '冷蔵庫の故障',
        '長年使った冷蔵庫が故障。生活に必要な買い替えが発生した。',
        90000,
      ],
      [
        'repair',
        '急な修理代',
        '水漏れが見つかり、応急修理が必要になった。',
        45000,
      ],
      [
        'ceremony',
        '冠婚葬祭の出費',
        '親族の行事に参加。交通費や包みを用意する。',
        50000,
      ],
      [
        'pet',
        'ペットの通院',
        '大切なペットの体調が悪い。診察と処置を受ける。',
        70000,
      ],
      [
        'moving',
        '引っ越しの追加費用',
        '退去時の補修と荷物の運搬に、予定外の費用がかかった。',
        110000,
      ],
    ] as const
  ).map(([id, name, description, cost]) => ({
    id,
    name,
    description,
    cost,
    kind: 'life' as const,
  })),
  {
    id: 'stranger',
    kind: 'chance',
    name: '怪しい儲け話',
    description:
      '見知らぬ人が「必ず儲かる」と誘ってきた。説明に裏付けはなく、参加費を失うリスクが高そうだ。',
    choices: [
      { id: 'decline', label: '断って立ち去る', hint: '費用も報酬もなし。' },
      {
        id: 'risk',
        label: '少額だけ試す',
        hint: '現金2万円が必要。成功は約3回に1回。成功なら4万円を受領、失敗なら参加費を失う。',
        cost: 20000,
        gamble: true,
      },
    ],
  },
  {
    id: 'lost',
    kind: 'chance',
    name: '落とし物',
    description:
      '帰り道に財布を見つけた。持ち主は困っているだろう。近くには交番がある。',
    choices: [
      {
        id: 'deliver',
        label: '交番へ届ける',
        hint: '持ち主から後日お礼。現金5,000円を受け取る。',
        gain: 5000,
      },
      {
        id: 'call',
        label: '警察に連絡して待つ',
        hint: '現金の変化なし。落ち着いて判断し、次の通常相場の下落を半減。',
        shield: true,
      },
    ],
  },
  {
    id: 'weekend',
    kind: 'chance',
    name: '休日の過ごし方',
    description:
      '忙しい日々の合間に、自由な休日ができた。休養と勉強、どちらに時間を使おうか。',
    choices: [
      {
        id: 'rest',
        label: '家でゆっくり休む',
        hint: '費用なし。冷静さを取り戻し、次の通常相場の下落を半減。',
        shield: true,
      },
      {
        id: 'study',
        label: '市場を調べる',
        hint: '費用なし。次の市場予報で資産ごとの方向感を確認できる。',
        insight: true,
      },
    ],
  },
  {
    id: 'seminar',
    kind: 'chance',
    name: '投資勉強会',
    description:
      '実績を公開している講師の少人数講座。学べる内容と参加費が明記されている。',
    choices: [
      {
        id: 'join',
        label: '参加する',
        hint: '現金2万円で「分散投資」を1枚獲得し、次の予報が詳しくなる。',
        cost: 20000,
        card: 'diversify',
        insight: true,
      },
      { id: 'skip', label: '今回は見送る', hint: '費用なし。現金を温存する。' },
    ],
  },
  {
    id: 'shopping',
    kind: 'chance',
    name: '期間限定のセール',
    description: '欲しかった品がセールに。必要なものか、一呼吸置いて考えたい。',
    choices: [
      {
        id: 'buy',
        label: '予算を決めて買う',
        hint: '現金3万円を支払う。気分転換で、次の通常相場の下落を半減。',
        cost: 30000,
        shield: true,
      },
      {
        id: 'save',
        label: '衝動買いを見送る',
        hint: '支出なし。「現金確保」を1枚獲得。',
        card: 'cashReserve',
      },
    ],
  },
  {
    id: 'income',
    kind: 'chance',
    name: '臨時収入の使い道',
    description:
      '手伝った仕事の謝礼を受け取れる。現金で受け取るか、学びに使うかを選べる。',
    choices: [
      {
        id: 'cash',
        label: '謝礼を受け取る',
        hint: '現金4万円を獲得。',
        gain: 40000,
      },
      {
        id: 'learn',
        label: '教材と交換する',
        hint: '現金の増減なし。「ドルコスト平均法」を1枚獲得し、次の予報が詳しくなる。',
        card: 'dollarCost',
        insight: true,
      },
    ],
  },
];
export type IncidentRecord = {
  id: string;
  turn: number;
  choice: string;
  message: string;
  cashBefore: number;
  investedBefore: number;
  cashAfter: number;
  investedAfter: number;
  totalAfter: number;
  cost: number;
  forcedSale: number;
  rate: number | null;
  card: CardId | null;
  insight: boolean;
  shield: boolean;
};
export type IncidentState = {
  incidentRng: number;
  currentIncident: string | null;
  incidentHistory: IncidentRecord[];
  lastIncidentTurn: number;
  incidentCheckedTurn: number;
  forecastInsight: boolean;
  nextLossShield: boolean;
};
export function createIncidents(seed: number): IncidentState {
  return {
    incidentRng: (seed ^ 0xc83a91e7) >>> 0,
    currentIncident: null,
    incidentHistory: [],
    lastIncidentTurn: -1,
    incidentCheckedTurn: 0,
    forecastInsight: false,
    nextLossShield: false,
  };
}
export function incidentRandom(s: IncidentState) {
  s.incidentRng = (s.incidentRng + 0x6d2b79f5) >>> 0;
  let t = s.incidentRng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function drawIncident(s: IncidentState, turn: number) {
  if (s.incidentCheckedTurn >= turn) return null;
  s.incidentCheckedTurn = turn;
  if (s.lastIncidentTurn === turn - 1) return null;
  const available = INCIDENTS.filter(
    (e) => !s.incidentHistory.some((h) => h.id === e.id),
  );
  const needed = INCIDENT_RULES.minimum - s.incidentHistory.length;
  const slots = Math.ceil((INCIDENT_RULES.turns - turn + 1) / 2);
  if (
    !available.length ||
    (needed < slots && incidentRandom(s) >= INCIDENT_RULES.probability)
  )
    return null;
  const incident = available[Math.floor(incidentRandom(s) * available.length)];
  s.lastIncidentTurn = turn;
  s.currentIncident = incident.id;
  return incident;
}
