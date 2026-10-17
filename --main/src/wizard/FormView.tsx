import type { FormBlock, WizardDocument } from "./models";
import { accompanying } from "./engine";
export function Blocks({ blocks }: { blocks: FormBlock[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        b.type === "pageBreak" ? (
          <div className="wizard-page-break" key={i} />
        ) : b.type === "heading" ? (
          b.level === 1 ? (
            <h1 key={i}>{b.text}</h1>
          ) : (
            <h2 key={i}>{b.text}</h2>
          )
        ) : b.type === "table" ? (
          <table key={i}>
            {b.columnWidths && (
              <colgroup>
                {b.columnWidths.map((width, index) => (
                  <col key={index} style={{ width: width + "%" }} />
                ))}
              </colgroup>
            )}
            <thead>
              {b.headerGroup ? (
                <>
                  <tr>
                    {b.headers?.slice(0, b.headerGroup.from).map((head, j) => (
                      <th key={j} rowSpan={2}>
                        {head}
                      </th>
                    ))}
                    <th colSpan={b.headerGroup.span}>{b.headerGroup.label}</th>
                  </tr>
                  <tr>
                    {b.headers?.slice(b.headerGroup.from).map((head, j) => (
                      <th key={j}>{head}</th>
                    ))}
                  </tr>
                </>
              ) : (
                <tr>
                  {b.headers?.map((head, j) => (
                    <th key={j}>{head}</th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {b.rows?.map((row, j) => (
                <tr key={j}>
                  {row.map((cell, k) => (
                    <td key={k}>{cell || "\u00a0"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="pre" key={i}>
            {b.text}
          </p>
        ),
      )}
    </>
  );
}
export function WizardFormView({ doc }: { doc: WizardDocument }) {
  return (
    <div className="wizard-form">
      <Blocks blocks={doc.blocks} />
      <div className="wizard-page-break" />
      <section className="wizard-cover">
        <Blocks blocks={accompanying(doc)} />
      </section>
    </div>
  );
}
