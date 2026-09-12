// Which rectangle of a sheet a cell occupies (ADR-0070 §2).
//
// ONE ARITHMETIC, TWO READERS. An animation walks cells across a strip and a tileset indexes
// cells across a sheet; both are "the nth cell of a regular grid, counting across and then
// down", and both had to answer it identically or a tile painted from a sheet would land one
// pixel away from the same cell played as a frame. It was `animation.js`'s private loop until
// a second caller needed it — which is the moment a shared primitive earns its file, and not
// before (ADR-0062 §4 declared the grid; this is the line that reads it).
//
// PURE, AND THAT IS THE POINT. It never asks how wide the decoded picture is: `columns` is
// DECLARED by whoever cut the sheet. Measuring would make the same cell a different rectangle
// before and after a decode finished, and would put the renderer inside a Core function.
//
// NO CELL SIZE MEANS NO RECTANGLE, which reads as "draw the whole picture". That is how a
// still is expressed without inventing a second shape for one.

/**
 * The rectangle of a sheet the nth cell of a regular grid occupies.
 *
 * @param {object} grid - The cutting
 * @param {number} grid.index - Which cell, from 0
 * @param {number} grid.frameWidth - Cell width in pixels; 0 means the whole picture
 * @param {number} grid.frameHeight - Cell height in pixels; 0 means the whole picture
 * @param {number} [grid.columns] - Cells per row; 0 reads the sheet as a single strip
 * @param {number} [grid.first] - Which cell the count starts at
 * @returns {{x: number, y: number, width: number, height: number}|null} The rectangle, or null
 */
export function frameRect({ index, frameWidth, frameHeight, columns = 0, first = 0 }) {
    if (!(frameWidth > 0) || !(frameHeight > 0)) return null;

    const cell = first + globalThis.Math.max(0, globalThis.Math.floor(index));
    const across = columns > 0 ? columns : 0;

    // A SHEET WITH NO DECLARED WIDTH IS ONE ROW. It is what a strip is, and it is what a
    // creator who typed nothing meant.
    const column = across > 0 ? cell % across : cell;
    const row = across > 0 ? globalThis.Math.floor(cell / across) : 0;

    return {
        x: column * frameWidth,
        y: row * frameHeight,
        width: frameWidth,
        height: frameHeight
    };
}
