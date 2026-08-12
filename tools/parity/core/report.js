import { VERDICT } from './compare.js';
import { STATUS } from '../mapping.js';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `[${code}m${s}[0m` : s);
const green = s => c('32', s);
const yellow = s => c('33', s);
const red = s => c('31', s);
const dim = s => c('2', s);
const bold = s => c('1', s);

const STATUS_TAG = {
    [STATUS.CONTRACT]: dim('[contract]'),
    [STATUS.QUIRK]: yellow('[quirk]'),
    [STATUS.BUG]: red('[legacy bug]')
};

/**
 * Print the report and return the process exit code.
 * @param {Array} verdicts - Output of compare()
 * @param {object} meta - Run metadata
 * @returns {number} 0 when nothing unexpected diverged, 1 otherwise
 */
export function report(verdicts, meta) {
    const groups = {
        [VERDICT.IDENTICAL]: [],
        [VERDICT.INTENTIONAL]: [],
        [VERDICT.UNEXPECTED]: [],
        [VERDICT.NEW]: [],
        [VERDICT.MISSING]: [],
        [VERDICT.ERROR]: []
    };
    for (const v of verdicts) groups[v.verdict].push(v);

    console.log('');
    console.log(bold(`  Parity harness — target "${meta.target}"`));
    console.log(dim(`  reference: ${meta.reference}`));
    console.log('');

    section(green('  ✓ Identical behaviour'), groups[VERDICT.IDENTICAL], v =>
        `${v.id} ${STATUS_TAG[v.status] ?? ''}`);

    section(yellow('  ~ Intentional divergence'), groups[VERDICT.INTENTIONAL], v => {
        const head = `${v.id} ${STATUS_TAG[v.status] ?? ''}`;
        return v.reason ? `${head}\n      ${dim(v.reason)}` : head;
    });

    section(red('  ✗ UNEXPECTED divergence'), groups[VERDICT.UNEXPECTED], v => {
        let out = `${v.id} ${STATUS_TAG[v.status] ?? ''}`;
        for (const d of v.detail ?? []) {
            out += `\n      ${bold(d.field)}`;
            out += `\n        expected: ${compact(d.expected)}`;
            out += `\n        actual  : ${compact(d.actual)}`;
        }
        return out;
    });

    section(red('  ! Execution error'), groups[VERDICT.ERROR], v =>
        `${v.id}\n      ${v.detail}`);

    section(dim('  + New scenario (no reference)'), groups[VERDICT.NEW], v =>
        `${v.id} ${STATUS_TAG[v.status] ?? ''}`);

    section(red('  - Scenario missing from the reference'), groups[VERDICT.MISSING], v => v.id);

    const failures = groups[VERDICT.UNEXPECTED].length + groups[VERDICT.ERROR].length
        + groups[VERDICT.MISSING].length;

    console.log('');
    console.log(
        `  ${green(groups[VERDICT.IDENTICAL].length + ' identical')}` +
        `  ${yellow(groups[VERDICT.INTENTIONAL].length + ' intentional')}` +
        `  ${failures ? red(failures + ' problem(s)') : dim('0 problems')}` +
        (groups[VERDICT.NEW].length ? dim(`  ${groups[VERDICT.NEW].length} new`) : '')
    );
    console.log('');

    if (groups[VERDICT.NEW].length && meta.target === 'legacy') {
        console.log(dim('  Hint: `node tools/parity/run.js --update` records the reference.'));
        console.log('');
    }

    return failures > 0 ? 1 : 0;
}

function section(title, items, format) {
    if (items.length === 0) return;
    console.log(title);
    for (const item of items) console.log(`    ${format(item)}`);
    console.log('');
}

function compact(value) {
    const text = JSON.stringify(value);
    if (!text) return String(value);
    return text.length > 220 ? text.slice(0, 217) + '…' : text;
}
