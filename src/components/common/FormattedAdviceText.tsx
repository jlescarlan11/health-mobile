import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { theme as appTheme } from '../../theme';

export interface FormattedAdviceTextProps {
  advice?: string | null;
}

type ContentChunk =
  | { type: 'paragraph'; content: string }
  | { type: 'listItem'; content: string; marker?: string };

const BULLET_REGEX = /^([-\u2022*])\s+/;
const NUMBERED_REGEX = /^(\d+)\.\s+/;

const parseAdvice = (advice?: string | null): ContentChunk[] => {
  const normalizedAdvice = advice?.trim() ?? '';
  if (!normalizedAdvice) return [];

  const blocks = normalizedAdvice
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => !!block);

  const results: ContentChunk[] = [];

  blocks.forEach((block) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !!line);

    const hasListIndicator = lines.some(
      (line) => BULLET_REGEX.test(line) || NUMBERED_REGEX.test(line),
    );

    if (hasListIndicator) {
      lines.forEach((line) => {
        const bulletMatch = line.match(BULLET_REGEX);
        const numberMatch = line.match(NUMBERED_REGEX);
        const marker = bulletMatch ? '\u2022' : numberMatch ? `${numberMatch[1]}.` : undefined;
        const markerRegex = bulletMatch ? BULLET_REGEX : numberMatch ? NUMBERED_REGEX : null;
        const content = (markerRegex ? line.replace(markerRegex, '') : line).trim();

        if (!content) return;

        results.push({ type: 'listItem', content, marker });
      });
    } else {
      const paragraph = lines.join(' ').trim();
      if (paragraph) {
        results.push({ type: 'paragraph', content: paragraph });
      }
    }
  });

  return results;
};

const FormattedAdviceText: React.FC<FormattedAdviceTextProps> = ({ advice }) => {
  const theme = useTheme();
  const chunks = useMemo(() => parseAdvice(advice), [advice]);

  const spacing = (theme as typeof appTheme).spacing;
  const paragraphSpacing = spacing?.md ?? 12;
  const listSpacing = spacing?.sm ?? 8;
  const indent = spacing?.md ?? 12;
  const markerMargin = spacing?.sm ?? 8;
  const textColor = theme.colors.onSurface ?? theme.colors.onBackground;
  const fallbackText = 'No advice available.';

  if (chunks.length === 0) {
    return (
      <Text
        variant="bodyLarge"
        style={[styles.paragraph, { color: textColor, marginBottom: paragraphSpacing }]}
      >
        {fallbackText}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {chunks.map((chunk, index) => {
        if (chunk.type === 'paragraph') {
          return (
            <Text
              key={`paragraph-${index}`}
              variant="bodyLarge"
              style={[styles.paragraph, { color: textColor, marginBottom: paragraphSpacing }]}
            >
              {chunk.content}
            </Text>
          );
        }

        const markerText = `${chunk.marker ?? '\u2022'} `;

        return (
          <View
            key={`list-${index}`}
            style={[styles.listItem, { paddingLeft: indent, marginBottom: listSpacing }]}
          >
            <Text
              variant="bodyMedium"
              style={[styles.listMarker, { marginRight: markerMargin, color: textColor }]}
            >
              {markerText}
            </Text>
            <Text variant="bodyMedium" style={[styles.listContent, { color: textColor }]}>
              {chunk.content}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  paragraph: {
    lineHeight: 22,
    flexWrap: 'wrap',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  listMarker: {
    lineHeight: 22,
    flexWrap: 'wrap',
  },
  listContent: {
    flex: 1,
    lineHeight: 22,
    flexWrap: 'wrap',
  },
});

export default FormattedAdviceText;
