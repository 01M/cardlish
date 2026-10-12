import { StyleSheet } from "react-native";
import { lightTheme } from "../theme/tokens";
import { splitStyle } from "./PressableScale";

describe("splitStyle", () => {
  it("returns empty styles for an undefined style", () => {
    expect(splitStyle(undefined)).toEqual({ outer: {}, inner: {} });
  });

  it("sends margins and alignSelf to the outer style and visuals to the inner one", () => {
    const { outer, inner } = splitStyle({
      alignSelf: "center",
      marginTop: 8,
      marginHorizontal: 12,
      backgroundColor: lightTheme.buttonInk,
      borderRadius: 16,
      paddingVertical: 15,
    });

    expect(outer).toEqual({
      alignSelf: "center",
      marginTop: 8,
      marginHorizontal: 12,
    });
    expect(inner).toEqual({
      backgroundColor: lightTheme.buttonInk,
      borderRadius: 16,
      paddingVertical: 15,
    });
  });

  it("sends position props to the outer style", () => {
    const { outer, inner } = splitStyle({
      position: "absolute",
      top: 0,
      right: 4,
      zIndex: 2,
      opacity: 0.5,
    });

    expect(outer).toEqual({ position: "absolute", top: 0, right: 4, zIndex: 2 });
    expect(inner).toEqual({ opacity: 0.5 });
  });

  it("copies numeric heights to both styles without stretching the inner one", () => {
    const { outer, inner } = splitStyle({
      height: 44,
      minHeight: 40,
      maxHeight: 60,
      width: 44,
    });

    expect(outer).toEqual({ height: 44, minHeight: 40, maxHeight: 60, width: 44 });
    expect(inner).toEqual({ height: 44, minHeight: 40, maxHeight: 60 });
  });

  it.each([
    ["flex: 1", { flex: 1 }],
    ["flexGrow: 1", { flexGrow: 1 }],
    ["flexBasis", { flexBasis: 0 }],
    ["aspectRatio", { aspectRatio: 1 }],
  ])("stretches the inner block when the outer height comes from %s", (_, style) => {
    const { outer, inner } = splitStyle(style);

    expect(outer).toEqual(style);
    expect(inner).toEqual({ flexGrow: 1 });
  });

  it("stretches the inner block for a non-numeric height and keeps that height outside", () => {
    const { outer, inner } = splitStyle({ height: "100%" });

    expect(outer).toEqual({ height: "100%" });
    expect(inner).toEqual({ flexGrow: 1 });
  });

  it("does not stretch the inner block for flex: 0 or flexGrow: 0", () => {
    expect(splitStyle({ flex: 0 }).inner).toEqual({});
    expect(splitStyle({ flexGrow: 0 }).inner).toEqual({});
  });

  it("flattens an array style, later entries win", () => {
    const styles = StyleSheet.create({
      base: { backgroundColor: lightTheme.buttonInk, marginTop: 4, padding: 10 },
    });
    const { outer, inner } = splitStyle([
      styles.base,
      { marginTop: 12 },
      [{ padding: 18 }, { alignSelf: "stretch" }],
    ]);

    expect(outer).toEqual({ marginTop: 12, alignSelf: "stretch" });
    expect(inner).toEqual({ backgroundColor: lightTheme.buttonInk, padding: 18 });
  });

  it("ignores undefined, null and false entries", () => {
    const isActive = false as boolean;
    const { outer, inner } = splitStyle([
      undefined,
      { marginBottom: 6 },
      null,
      isActive && { flex: 1 },
      { borderWidth: 1 },
    ]);

    expect(outer).toEqual({ marginBottom: 6 });
    expect(inner).toEqual({ borderWidth: 1 });
  });

  it("does not stretch a content-sized button in an alignItems: flex-start row", () => {
    // Регрессия «растянутой + Добавить» (шапка WordsScreen: ряд с
    // alignItems: "flex-start", у кнопки нет размеров). Если внутреннему
    // блоку безусловно дать flexGrow: 1, Yoga меряет Pressable с
    // ограничением «не больше» и растягивает кнопку до высоты ряда
    // (заголовок из трёх строк). Без явной высоты flexGrow не нужен
    const { outer, inner } = splitStyle({
      backgroundColor: lightTheme.orangeAccent,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    });

    expect(outer).toEqual({});
    expect(inner).not.toHaveProperty("flexGrow");
  });
});
