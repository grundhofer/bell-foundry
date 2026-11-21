// Hand-tuned motion clips. travel is [left, forward] in meters. Footfalls and marks use clip time in seconds.

export const pilgrim = {
  walk_in: {
    kind: 'act',
    loop: false,
    root: true,
    travel: [0.009, 8.518],
    marks: { slowing: 5.0, last_step: 7.533, stopped: 7.9 },
    events: [
      { t: 0.667, name: 'foot-r' },
      { t: 1.333, name: 'foot-l' },
      { t: 1.967, name: 'foot-r' },
      { t: 2.533, name: 'foot-l' },
      { t: 3.167, name: 'foot-r' },
      { t: 3.733, name: 'foot-l' },
      { t: 4.333, name: 'foot-r' },
      { t: 4.933, name: 'foot-l' },
      { t: 5.533, name: 'foot-r' },
      { t: 6.167, name: 'foot-l' },
      { t: 6.833, name: 'foot-r' },
      { t: 7.533, name: 'foot-l' },
    ],
  },
};
