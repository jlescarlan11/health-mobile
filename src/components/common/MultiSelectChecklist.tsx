import React, { memo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Checkbox, RadioButton, Text, useTheme } from 'react-native-paper';

export interface ChecklistOption {
  id: string;
  label: string;
}

export interface GroupedChecklistOption {
  category: string;
  items: ChecklistOption[];
}

interface MultiSelectChecklistProps {
  options: ChecklistOption[] | GroupedChecklistOption[];
  selectedIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  title?: string;
  singleSelection?: boolean;
}

// Moved outside component to avoid recreation on every render
const isGroupedOptions = (opts: unknown[]): opts is GroupedChecklistOption[] => {
  return (
    Array.isArray(opts) &&
    opts.length > 0 &&
    typeof opts[0] === 'object' &&
    opts[0] !== null &&
    'category' in opts[0]
  );
};

// Memoized option item component to prevent unnecessary re-renders
interface OptionItemProps {
  option: ChecklistOption;
  isSelected: boolean;
  onToggle: (id: string) => void;
  singleSelection: boolean;
  primaryColor: string;
}

const OptionItem = memo<OptionItemProps>(
  ({ option, isSelected, onToggle, singleSelection, primaryColor }) => {
    if (singleSelection) {
      return (
        <RadioButton.Item
          key={option.id}
          value={option.id}
          label={option.label}
          status={isSelected ? 'checked' : 'unchecked'}
          onPress={() => onToggle(option.id)}
          color={primaryColor}
          position="leading"
          labelStyle={styles.label}
          style={styles.item}
          mode="android"
        />
      );
    }

    return (
      <Checkbox.Item
        key={option.id}
        label={option.label}
        status={isSelected ? 'checked' : 'unchecked'}
        onPress={() => onToggle(option.id)}
        color={primaryColor}
        position="leading"
        labelStyle={styles.label}
        style={styles.item}
        mode="android"
      />
    );
  },
);

OptionItem.displayName = 'OptionItem';

/**
 * A reusable selection component (Checklist or Radio Group) using React Native Paper components.
 * Supports both multi-select (Checkbox) and single-select (Radio) modes.
 */
export const MultiSelectChecklist: React.FC<MultiSelectChecklistProps> = ({
  options,
  selectedIds,
  onSelectionChange,
  title,
  singleSelection = false,
}) => {
  const theme = useTheme();

  // Memoized toggle function to avoid recreation on every render
  const toggleOption = useCallback(
    (id: string) => {
      if (singleSelection) {
        onSelectionChange([id]);
      } else {
        const newSelected = selectedIds.includes(id)
          ? selectedIds.filter((item) => item !== id)
          : [...selectedIds, id];
        onSelectionChange(newSelected);
      }
    },
    [selectedIds, singleSelection, onSelectionChange],
  );

  const renderOptionItem = (option: ChecklistOption) => {
    const isSelected = selectedIds.includes(option.id);

    return (
      <OptionItem
        key={option.id}
        option={option}
        isSelected={isSelected}
        onToggle={toggleOption}
        singleSelection={singleSelection}
        primaryColor={theme.colors.primary}
      />
    );
  };

  return (
    <View style={styles.container}>
      {!!title && (
        <Text variant="titleSmall" style={[styles.title, { color: theme.colors.onSurfaceVariant }]}>
          {title.toUpperCase()}
        </Text>
      )}
      <View style={styles.listContainer}>
        {isGroupedOptions(options)
          ? options.map((group, index) => (
              <View key={group.category} style={index > 0 ? styles.groupContainer : undefined}>
                <Text
                  variant="labelMedium"
                  style={[styles.groupTitle, { color: theme.colors.primary }]}
                >
                  {group.category}
                </Text>
                {group.items.map(renderOptionItem)}
              </View>
            ))
          : (options as ChecklistOption[]).map(renderOptionItem)}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  title: {
    marginBottom: 8,
    paddingHorizontal: 16,
    letterSpacing: 1.5,
    fontWeight: '700',
    fontSize: 12,
  },
  groupContainer: {
    marginTop: 16,
  },
  groupTitle: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    fontWeight: '600',
  },
  listContainer: {
    backgroundColor: 'transparent',
  },
  item: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 16,
    textAlign: 'left',
    marginLeft: 8,
  },
});
