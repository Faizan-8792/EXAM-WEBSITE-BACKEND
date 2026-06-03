/**
 * Fisher-Yates shuffle — returns a new array with items in random order.
 * @param {Array} items
 * @returns {Array}
 */
const shuffle = (items) => {
  const values = [...items];

  for (let index = values.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[randomIndex]] = [values[randomIndex], values[index]];
  }

  return values;
};

module.exports = { shuffle };
