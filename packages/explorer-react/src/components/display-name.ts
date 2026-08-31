const isUppercaseAscii = (character: string | undefined) =>
  character !== undefined && character >= 'A' && character <= 'Z';

const isLowercaseAscii = (character: string | undefined) =>
  character !== undefined && character >= 'a' && character <= 'z';

const isDigitAscii = (character: string | undefined) =>
  character !== undefined && character >= '0' && character <= '9';

const isExplorerNameSeparator = (character: string) =>
  character === '.' || character === '_' || character === '-' || character.trim() === '';

const splitExplorerName = (name: string) => {
  const words: string[] = [];
  let word = '';

  const finishWord = () => {
    if (word) words.push(word);
    word = '';
  };

  for (let index = 0; index < name.length; index += 1) {
    const character = name[index]!;
    if (isExplorerNameSeparator(character)) {
      finishWord();
      continue;
    }

    const previous = name[index - 1];
    const next = name[index + 1];
    if (
      word &&
      isUppercaseAscii(character) &&
      ((isUppercaseAscii(previous) && isLowercaseAscii(next)) ||
        isLowercaseAscii(previous) ||
        isDigitAscii(previous))
    ) {
      finishWord();
    }
    word += character;
  }
  finishWord();
  return words;
};

export const humanizeExplorerName = (name: string) =>
  splitExplorerName(name)
    .map(word => {
      if (word === word.toUpperCase()) {
        return word;
      }

      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(' ');
