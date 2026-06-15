const BASE_URL = 'http://localhost:4000/api';

async function api(method, path, data = null, headers = {}) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers }
  };
  if (data) options.body = JSON.stringify(data);
  const res = await fetch(`${BASE_URL}${path}`, options);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function test() {
  console.log('========== 回声工坊 大赛技能测试 ==========\n');

  // 1. 登录用户1
  console.log('=== 1. 登录用户1 ===');
  const login1 = await api('POST', '/auth/login', {
    username: 'testuser4',
    password: '123456'
  });
  const token1 = login1.token;
  const user1 = login1.player;
  console.log(`用户1: ${user1.nickname}, ID: ${user1.id}, 金币: ${user1.gold}`);
  const headers1 = { Authorization: `Bearer ${token1}` };

  // 获取当前大赛
  const contest = await api('GET', '/contest/current', null, headers1);
  const contestId = contest.contest.id;
  console.log(`当前大赛ID: ${contestId}, 状态: ${contest.contest.status}\n`);

  // 2. 查看初始排行
  console.log('=== 2. 初始排行 ===');
  const standings0 = await api('GET', `/contest/standings/${contestId}`, null, headers1);
  console.log('排行列表:');
  standings0.standings.forEach((s, i) => {
    console.log(`  ${i+1}. ${s.nickname}: 强度=${s.intensity}, 分数=${s.score}`);
  });
  console.log('');

  // 3. 用户1报名大赛
  console.log('=== 3. 用户1报名大赛 ===');
  const detectors1 = await api('GET', '/crafting/detectors', null, headers1);
  console.log(`用户1探测器: ${detectors1.detectors[0]?.name}`);
  
  if (detectors1.detectors.length > 0) {
    const joinResult = await api('POST', '/contest/join', {
      contest_id: contestId,
      detector_id: detectors1.detectors[0].id
    }, headers1);
    console.log(`报名结果: ${joinResult.message}`);
    console.log(`我的参赛ID: ${joinResult.entryId}`);
    var myEntryId = joinResult.entryId;
  }
  await new Promise(r => setTimeout(r, 3000));

  const standings1 = await api('GET', `/contest/standings/${contestId}`, null, headers1);
  console.log('\n报名后排行:');
  standings1.standings.forEach((s, i) => {
    console.log(`  ${i+1}. ${s.nickname}: 强度=${s.intensity}, 分数=${s.score}, entryId=${s.id}`);
  });
  const myEntry1 = standings1.standings.find(s => s.player_id === user1.id);
  const oldScore = myEntry1 ? myEntry1.score : 0;
  const oldIntensity = myEntry1 ? myEntry1.intensity : 0;
  console.log(`  我的分数: ${oldScore}, 强度: ${oldIntensity}`);
  console.log('');

  // 4. 对自己使用聚焦增强
  console.log('=== 4. 对自己使用聚焦增强（强度×1.2，分数应同步上升） ===');
  const skillFocus = await api('POST', '/contest/skill', {
    skillType: 'focus_boost',
    targetEntryId: myEntryId
  }, headers1);
  console.log(`技能使用结果: ${skillFocus.message}`);
  await new Promise(r => setTimeout(r, 3000));

  const standings2 = await api('GET', `/contest/standings/${contestId}`, null, headers1);
  console.log('\n聚焦增强后排行:');
  standings2.standings.forEach((s, i) => {
    console.log(`  ${i+1}. ${s.nickname}: 强度=${s.intensity}, 分数=${s.score}`);
  });
  const myEntry2 = standings2.standings.find(s => s.player_id === user1.id);
  const newScore = myEntry2 ? myEntry2.score : 0;
  const newIntensity = myEntry2 ? myEntry2.intensity : 0;
  console.log(`  我的分数: ${oldScore} → ${newScore} (变化: ${(newScore-oldScore).toFixed(1)})`);
  console.log(`  我的强度: ${oldIntensity} → ${newIntensity} (变化: ${(newIntensity-oldIntensity).toFixed(1)})`);
  const expectedIntensity = oldIntensity * 1.2;
  const expectedScore = oldScore * 1.2;
  console.log(`  预期强度: ${expectedIntensity.toFixed(1)}, 预期分数: ${expectedScore.toFixed(1)}`);
  console.log(`  强度匹配: ${Math.abs(newIntensity - expectedIntensity) < 1 ? '✅' : '❌'}`);
  console.log(`  分数匹配: ${Math.abs(newScore - expectedScore) < 1 ? '✅' : '❌'}`);
  console.log('');

  // 5. 查看对手
  console.log('=== 5. 查看对手列表 ===');
  const opponents = await api('GET', '/contest/opponents', null, headers1);
  console.log(`对手数量: ${opponents.opponents.length}`);
  opponents.opponents.forEach(o => {
    console.log(`  ${o.nickname}: 强度=${o.intensity}, 分数=${o.score}, entryId=${o.id}`);
  });
  const targetOpponent = opponents.opponents[0];
  const opponentOldScore = targetOpponent ? targetOpponent.score : 0;
  const opponentOldIntensity = targetOpponent ? targetOpponent.intensity : 0;
  const targetEntryId = targetOpponent?.id;
  console.log(`选择对手: ${targetOpponent?.nickname}, entryId: ${targetEntryId}`);
  console.log('');

  // 6. 对对手使用干扰脉冲
  console.log('=== 6. 对对手使用干扰脉冲（强度×0.85，分数应下降） ===');
  const skillJam = await api('POST', '/contest/skill', {
    skillType: 'interference_pulse',
    targetEntryId: targetEntryId
  }, headers1);
  console.log(`技能使用结果: ${skillJam.message}`);
  await new Promise(r => setTimeout(r, 3000));

  const standings3 = await api('GET', `/contest/standings/${contestId}`, null, headers1);
  console.log('\n干扰脉冲后排行:');
  standings3.standings.forEach((s, i) => {
    console.log(`  ${i+1}. ${s.nickname}: 强度=${s.intensity}, 分数=${s.score}`);
  });
  const opponentEntry = standings3.standings.find(s => s.id === targetEntryId);
  const opponentNewScore = opponentEntry ? opponentEntry.score : 0;
  const opponentNewIntensity = opponentEntry ? opponentEntry.intensity : 0;
  console.log(`  对手分数: ${opponentOldScore} → ${opponentNewScore} (变化: ${(opponentNewScore-opponentOldScore).toFixed(1)})`);
  console.log(`  对手强度: ${opponentOldIntensity} → ${opponentNewIntensity} (变化: ${(opponentNewIntensity-opponentOldIntensity).toFixed(1)})`);
  const expectedOppIntensity = opponentOldIntensity * 0.85;
  const expectedOppScore = opponentOldScore * 0.85;
  console.log(`  预期强度: ${expectedOppIntensity.toFixed(1)}, 预期分数: ${expectedOppScore.toFixed(1)}`);
  console.log(`  强度匹配: ${Math.abs(opponentNewIntensity - expectedOppIntensity) < 1 ? '✅' : '❌'}`);
  console.log(`  分数匹配: ${Math.abs(opponentNewScore - expectedOppScore) < 1 ? '✅' : '❌'}`);
  console.log('');

  // 7. 刷新页面验证
  console.log('=== 7. 刷新验证（再次获取排行，数值不应跳回） ===');
  const standings4 = await api('GET', `/contest/standings/${contestId}`, null, headers1);
  const myEntry4 = standings4.standings.find(s => s.player_id === user1.id);
  const oppEntry4 = standings4.standings.find(s => s.id === targetEntryId);
  console.log(`  我的分数: ${myEntry4?.score} (之前: ${newScore}), 一致: ${myEntry4?.score === newScore ? '✅' : '❌'}`);
  console.log(`  我的强度: ${myEntry4?.intensity} (之前: ${newIntensity}), 一致: ${myEntry4?.intensity === newIntensity ? '✅' : '❌'}`);
  console.log(`  对手分数: ${oppEntry4?.score} (之前: ${opponentNewScore}), 一致: ${oppEntry4?.score === opponentNewScore ? '✅' : '❌'}`);
  console.log(`  对手强度: ${oppEntry4?.intensity} (之前: ${opponentNewIntensity}), 一致: ${oppEntry4?.intensity === opponentNewIntensity ? '✅' : '❌'}`);
  console.log('');

  console.log('========== 大赛技能测试完成 ==========\n');
}

test().catch(err => {
  console.error('测试失败:', err.message);
});
