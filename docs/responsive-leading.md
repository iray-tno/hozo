# Explicit leading across text-size breakpoints

`text-lg sm:text-xl leading-relaxed` retains the explicit ratio (1.625):
29.25px at an 18px font size, then 32.5px at 20px. An absolute `leading-6`
stays 24px. Reversing the class list does not turn a text-size default into
an explicit override. This applies to static Tailwind typography on both
backends, not only to Web Paragraph.

The IR distinguishes a text-size utility's fallback line height from a
written leading. Web follows Tailwind's `--tw-leading` register and registers
it as non-inheriting, including in candidate sheets. A child with its own
text-size utility does not accidentally read its ancestor's register.
Line-height itself retains normal CSS inheritance.

Native has no unitless line-height value. It resolves the ratio against a
known font size and emits an absolute value under the intersection of the
leading and font-size guards. These reuse existing breakpoint/state hooks;
there is no text measurement, new listener or second condition evaluator.
An unresolved base font size still diagnoses instead of guessing from a size
that only applies above a breakpoint. A same-condition explicit leading wins
over that condition's fallback; inherited provenance does not outrank a
child's own fallback.

The Native host tests change widths on the same rendered field. The browser
regression compares computed font size, line height and three-line height
against the installed Tailwind engine at 375/639/640/767/768/1280px, including
class-order reversal, absolute leading, conditional leading and a default-only
control. Host tests do not establish device font metrics or glyph rasterization.
