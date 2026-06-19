export const EMPTY_SELECTION = Object.freeze({
  selected_type: null,
  selected_id: null,
});

export function selectionTargetForItem(item, options = {}) {
  if (!item?.id) return EMPTY_SELECTION;

  const auditIds = options.auditIds ?? new Set();
  if (item.item_type === "daily_overview") {
    return { selected_type: "daily_overview", selected_id: item.id };
  }

  if (item.item_type === "signal_event") {
    return { selected_type: "signal_event", selected_id: item.id };
  }

  if (auditIds.has(item.id) || options.mode === "audit") {
    return { selected_type: "audit_event", selected_id: item.id };
  }

  return EMPTY_SELECTION;
}

export function toggleSelection(currentSelection, targetSelection) {
  const current = currentSelection ?? EMPTY_SELECTION;
  const target = targetSelection ?? EMPTY_SELECTION;

  if (
    current.selected_type === target.selected_type &&
    current.selected_id === target.selected_id
  ) {
    return EMPTY_SELECTION;
  }

  return {
    selected_type: target.selected_type,
    selected_id: target.selected_id,
  };
}

export function clearSelection() {
  return EMPTY_SELECTION;
}

export function clearSelectionOnModeSwitch() {
  return EMPTY_SELECTION;
}

export function shouldExpandDayPostForSelection(dayPost, selectedId) {
  if (!dayPost || !selectedId) return false;
  const collapsedVisibleIds = dayPost.visible_item_ids_when_collapsed ?? [
    dayPost.default_collapsed_item_id,
  ];
  return !collapsedVisibleIds.includes(selectedId);
}

export function feedCardIdForChartItem(item) {
  return item?.chart?.feed_card_id ?? item?.id ?? null;
}

export function highlightsForSelection({
  mode = "public",
  selection = EMPTY_SELECTION,
  publicItems = [],
  auditItems = [],
} = {}) {
  if (mode === "audit") {
    const auditWindowIds =
      selection.selected_type === "audit_event" && selection.selected_id
        ? [selection.selected_id]
        : auditItems.map((item) => item.id);
    return {
      dayWindowIds: [],
      signalWindowIds: [],
      auditWindowIds,
    };
  }

  const signals = publicItems.filter(
    (item) => item.item_type === "signal_event",
  );

  if (mode === "both" && selection.selected_type === "audit_event") {
    return {
      dayWindowIds: [],
      signalWindowIds: [],
      auditWindowIds: selection.selected_id ? [selection.selected_id] : [],
    };
  }

  if (selection.selected_type === "daily_overview") {
    const overview = publicItems.find(
      (item) => item.id === selection.selected_id,
    );
    const includedSignalIds =
      overview?.chart?.included_signal_event_ids ??
      signals
        .filter((item) => item.date_utc === overview?.date_utc)
        .map((item) => item.id);

    return {
      dayWindowIds: overview ? [overview.id] : [],
      signalWindowIds: includedSignalIds,
      auditWindowIds: [],
    };
  }

  if (selection.selected_type === "signal_event" && selection.selected_id) {
    return {
      dayWindowIds: [],
      signalWindowIds: [selection.selected_id],
      auditWindowIds: [],
    };
  }

  return {
    dayWindowIds: [],
    signalWindowIds: signals.map((item) => item.id),
    auditWindowIds:
      mode === "both" ? auditItems.map((item) => item.id) : [],
  };
}
