import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

let client = null;

// 테스트에서 가짜 클라이언트 주입용. null이면 다음 사용 시 실제 클라이언트 생성
export function setS3Client(c) {
  client = c;
}

function getClient() {
  if (!client) {
    client = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });
  }
  return client;
}

// 게임 종료 시 결과를 S3 히스토리 버킷에 저장.
// HISTORY_BUCKET 미설정(로컬 개발)이면 생략 — 게임 흐름을 막지 않는다.
export async function saveGameHistory(state, winnerId) {
  const bucket = process.env.HISTORY_BUCKET;
  if (!bucket) return;

  const record = {
    game_id: state.game_id,
    winner: winnerId ?? null,
    finished_at: new Date().toISOString(),
    players: state.players.map(p => ({
      player_id: p.player_id,
      nickname: p.nickname,
      chips: p.chips,
    })),
  };

  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: `games/${state.game_id}.json`,
    Body: JSON.stringify(record),
    ContentType: 'application/json',
  }));
}
