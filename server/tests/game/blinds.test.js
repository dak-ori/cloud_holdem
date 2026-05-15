import { getBlinds } from '../../src/game/blinds.js';

test('4명: SB 10, BB 20', () => {
  expect(getBlinds(4)).toEqual({ sb: 10, bb: 20 });
});

test('3명: SB 20, BB 40', () => {
  expect(getBlinds(3)).toEqual({ sb: 20, bb: 40 });
});

test('2명: SB 40, BB 80', () => {
  expect(getBlinds(2)).toEqual({ sb: 40, bb: 80 });
});

test('1명 이하: 에러', () => {
  expect(() => getBlinds(1)).toThrow('invalid player count');
});
