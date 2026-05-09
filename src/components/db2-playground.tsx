"use client";

import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type * as MonacoEditor from "monaco-editor";

import { parseDb2Program } from "@src/lib/db2/grammar";
import {
  DB2_DATA_TYPES,
  DB2_INDEX_TYPES,
  DB2_KEYWORDS,
  DB2_LANGUAGE_SNIPPETS,
  DB2_OPERATORS,
} from "@src/lib/db2/language";
import { refreshDb2Catalog, runDb2Query } from "@src/services/db2.service";
import type { Db2ExecuteQueryResponse, Db2Program, Db2Row, Db2Statement, Db2Table } from "@src/types/db2";

const DEFAULT_QUERY = "SELECT * FROM users WHERE age BETWEEN 30 AND 42;";
const LANGUAGE_ID = "db2";
const THEME_ID = "db2-light";

let db2LanguageConfigured = false;
let db2CompletionCatalog: Db2Table[] = [];

function setDb2CompletionCatalog(catalog: Db2Table[]) {
  db2CompletionCatalog = catalog;
}

function getDb2CompletionTables() {
  return db2CompletionCatalog.map((table) => table.name);
}

function getDb2CompletionColumns() {
  return Array.from(
    new Set(db2CompletionCatalog.flatMap((table) => table.columns.map((column) => column.name))),
  );
}

function configureDb2Language(monaco: Parameters<BeforeMount>[0]) {
  if (db2LanguageConfigured) {
    return;
  }

  monaco.languages.register({ id: LANGUAGE_ID });
  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
    brackets: [
      ["(", ")"],
      ["[", "]"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });
  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/[;,.]/, "delimiter"],
        [/\(|\)/, "delimiter.parenthesis"],
        [/\b(?:CREATE|TABLE|SELECT|FROM|WHERE|INSERT|INTO|VALUES|DELETE|FILE|INDEX|SEQUENTIAL|HASH|BTREE|RTREE|BETWEEN|AND|IN|POINT|RADIUS|K|DEFAULT_INDEX|INT|FLOAT|VARCHAR)\b/i, "keyword"],
        [/<=|>=|!=|=|<|>/, "operator"],
        [/\b\d+(?:\.\d+)?\b/, "number"],
        [/"([^"\\]|\\.)*"/, "string"],
        [/'([^'\\]|\\.)*'/, "string"],
        [/[a-zA-Z_][\w$]*/, "identifier"],
        [/--.*$/, "comment"],
        [/\s+/, "white"],
      ],
    },
  });

  monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
    triggerCharacters: [" ", ".", "(", "=", ","],
    provideCompletionItems: (
      model: MonacoEditor.editor.ITextModel,
      position: MonacoEditor.Position,
    ) => {
      const linePrefix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const word = model.getWordUntilPosition(position);
      const completionRange: MonacoEditor.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const completionKind = monaco.languages.CompletionItemKind;
      const insertRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
      const keywordSuggestions: MonacoEditor.languages.CompletionItem[] = DB2_KEYWORDS.map((keyword) => ({
        label: keyword,
        kind: completionKind.Keyword,
        insertText: keyword,
        detail: "DB2 keyword",
        range: completionRange,
      }));

      const snippetSuggestions: MonacoEditor.languages.CompletionItem[] = DB2_LANGUAGE_SNIPPETS.map((snippet) => ({
        label: snippet.label,
        kind: completionKind.Snippet,
        insertText: snippet.insertText,
        insertTextRules: insertRules,
        detail: snippet.detail,
        range: completionRange,
      }));

      const tableSuggestions: MonacoEditor.languages.CompletionItem[] = getDb2CompletionTables().map((tableName) => ({
        label: tableName,
        kind: completionKind.Class,
        insertText: tableName,
        detail: "Table name",
        range: completionRange,
      }));

      const columnSuggestions: MonacoEditor.languages.CompletionItem[] = getDb2CompletionColumns().map((columnName) => ({
        label: columnName,
        kind: completionKind.Field,
        insertText: columnName,
        detail: "Column name",
        range: completionRange,
      }));

      const typeSuggestions: MonacoEditor.languages.CompletionItem[] = DB2_DATA_TYPES.map((dataType) => ({
        label: dataType,
        kind: completionKind.TypeParameter,
        insertText: dataType,
        detail: "DB2 data type",
        range: completionRange,
      }));

      const indexSuggestions: MonacoEditor.languages.CompletionItem[] = DB2_INDEX_TYPES.map((indexType) => ({
        label: indexType,
        kind: completionKind.EnumMember,
        insertText: indexType,
        detail: "Index type",
        range: completionRange,
      }));

      const operatorSuggestions: MonacoEditor.languages.CompletionItem[] = DB2_OPERATORS.map((operator) => ({
        label: operator,
        kind: completionKind.Operator,
        insertText: operator,
        detail: "Comparison operator",
        range: completionRange,
      }));

      const fileSnippet: MonacoEditor.languages.CompletionItem = {
        label: 'FROM FILE "path"',
        kind: completionKind.Snippet,
        insertText: 'FROM FILE "${1:path}"',
        insertTextRules: insertRules,
        detail: "Load rows from a file",
        range: completionRange,
      };

      let suggestions: MonacoEditor.languages.CompletionItem[] = [...snippetSuggestions, ...keywordSuggestions];

      if (/\b(?:FROM|INTO|TABLE)\s+[\w$]*$/i.test(linePrefix)) {
        suggestions = [...tableSuggestions, ...suggestions];
      } else if (/\bWHERE\s+[\w$]*$/i.test(linePrefix) || /\bAND\s+[\w$]*$/i.test(linePrefix)) {
        suggestions = [...columnSuggestions, ...operatorSuggestions, ...suggestions];
      } else if (/\bINDEX\s+[\w$]*$/i.test(linePrefix) || /\bINDEX\s*$/i.test(linePrefix)) {
        suggestions = [...indexSuggestions, ...suggestions];
      } else if (/\bFILE\s*["']?[^"']*$/i.test(linePrefix)) {
        suggestions = [fileSnippet, ...suggestions];
      } else if (/\bCREATE\s+TABLE\s+[\w$]*$/i.test(linePrefix)) {
        suggestions = [...tableSuggestions, ...suggestions];
      } else if (/\b(?:CREATE\s+TABLE\s+\w+\s*\(|,\s*)[\w$]*$/i.test(linePrefix)) {
        suggestions = [...columnSuggestions, ...typeSuggestions, ...suggestions];
      } else if (/\bVALUES\s*\([^)]*$/i.test(linePrefix)) {
        suggestions = [...columnSuggestions, ...suggestions];
      } else if (/\bSELECT\s+[\w,\s]*$/i.test(linePrefix)) {
        suggestions = [...columnSuggestions, ...suggestions];
      }

      return {
        suggestions,
      };
    },
  });

  monaco.editor.defineTheme(THEME_ID, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "1d4ed8", fontStyle: "bold" },
      { token: "string", foreground: "0f766e" },
      { token: "number", foreground: "9333ea" },
      { token: "identifier", foreground: "111827" },
      { token: "operator", foreground: "475569" },
      { token: "delimiter", foreground: "64748b" },
      { token: "comment", foreground: "94a3b8", fontStyle: "italic" },
    ],
    colors: {
      "editor.background": "#f8fafc",
      "editor.foreground": "#0f172a",
      "editor.lineHighlightBackground": "#e2e8f0",
      "editorLineNumber.foreground": "#94a3b8",
      "editorLineNumber.activeForeground": "#334155",
      "editorIndentGuide.background": "#e2e8f0",
      "editorIndentGuide.activeBackground": "#cbd5e1",
      "editorWidget.background": "#ffffff",
      "editorWidget.border": "#cbd5e1",
    },
  });
  db2LanguageConfigured = true;
}

interface Db2PlaygroundProps {
  initialCatalog: Db2Table[];
}

export function Db2Playground({ initialCatalog }: Db2PlaygroundProps) {
  const [catalog, setCatalog] = useState<Db2Table[]>(initialCatalog);
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [selectedTableName, setSelectedTableName] = useState(initialCatalog[0]?.name ?? "");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [execution, setExecution] = useState<Db2ExecuteQueryResponse | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const selectedTable = useMemo(() => catalog.find((table) => table.name === selectedTableName) ?? catalog[0] ?? null, [catalog, selectedTableName]);
  const liveParse = useMemo<Db2Program>(() => parseDb2Program(query), [query]);

  useEffect(() => {
    setDb2CompletionCatalog(catalog);
  }, [catalog]);

  const parseError = liveParse.errors[0] ?? null;
  const summaryStatement = liveParse.statements[0] ?? null;
  const latestResult = execution?.results[execution.results.length - 1] ?? null;

  function getStatementTableName(statement: Db2Statement): string {
    return statement.table;
  }

  const latestExecutionTable = latestResult
    ? execution?.tables.find((table) => table.name === getStatementTableName(latestResult.statement)) ?? null
    : null;

  function isWildcardColumns(columns?: string[] | null): boolean {
    return Array.isArray(columns) && columns.length === 1 && columns[0] === "*";
  }

  function getTableRecordCount(table: Db2Table | null | undefined): number {
    return table?.recordCount ?? table?.rows.length ?? 0;
  }

  function getTablePrimaryKey(table: Db2Table | null | undefined): string {
    return table?.primaryKey ?? "—";
  }

  function getTableIndexLabels(table: Db2Table | null | undefined): string[] {
    if (!table) {
      return [];
    }

    if (table.indexes?.length) {
      return table.indexes.map((index) =>
        typeof index.column === "string" ? `${index.column} · ${index.type}` : `${index.column.join(" / ")} · ${index.type}`,
      );
    }

    return table.columns
      .filter((column) => column.index !== "DEFAULT_INDEX")
      .map((column) => `${column.name} · ${column.index}`);
  }

  function getTablePointColumns(table: Db2Table | null | undefined): string[] {
    if (!table?.pointColumns) {
      return [];
    }

    return Object.keys(table.pointColumns);
  }

  function normalizeRowsForDisplay(rows: unknown[], columns: Db2Table["columns"]): Db2Row[] {
    if (!rows.length || !columns.length) {
      return [];
    }

    return rows.map((row) => {
      if (Array.isArray(row)) {
        return columns.reduce<Db2Row>((record, column, columnIndex) => {
          record[column.name] = row[columnIndex] ?? null;
          return record;
        }, {});
      }

      if (row && typeof row === "object") {
        const typedRow = row as Record<string, unknown>;
        const directMatch = columns.reduce<Db2Row>((record, column) => {
          record[column.name] = (typedRow[column.name] as Db2Row[string]) ?? null;
          return record;
        }, {});

        const hasAnyValue = columns.some((column) => directMatch[column.name] !== null);
        if (hasAnyValue) {
          return directMatch;
        }

        return columns.reduce<Db2Row>((record, column, columnIndex) => {
          const indexedValue = typedRow[String(columnIndex)];
          record[column.name] = (indexedValue as Db2Row[string]) ?? null;
          return record;
        }, {});
      }

      return columns.reduce<Db2Row>((record, column) => {
        record[column.name] = null;
        return record;
      }, {});
    });
  }

  async function handleRunQuery() {
    setIsRunning(true);
    setExecutionError(null);

    try {
      const outcome = await runDb2Query(query);
      setCatalog(outcome.catalog);
      setExecution(outcome.response);

      if (selectedTableName && !outcome.catalog.some((table: Db2Table) => table.name === selectedTableName)) {
        setSelectedTableName(outcome.catalog[0]?.name ?? "");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Query execution failed.";
      setExecutionError(message);
    } finally {
      setIsRunning(false);
    }
  }

  function handleClearEditor() {
    setQuery("");
    setExecution(null);
    setExecutionError(null);
  }

  async function handleRefreshTables() {
    const restoredCatalog = await refreshDb2Catalog();

    setCatalog(restoredCatalog);
    setSelectedTableName(restoredCatalog[0]?.name ?? "");
    setExecutionError(null);
    setExecution({
      source: "mock",
      program: { statements: [], errors: [] },
      results: [],
      tables: restoredCatalog,
    });
  }

  const resultColumns =
    isWildcardColumns(latestResult?.columns)
      ? latestExecutionTable?.columns ?? selectedTable?.columns ?? []
      : latestResult?.columns?.length
      ? latestResult.columns.map((column) => ({
          name: column,
          type: "VARCHAR" as const,
          index: "DEFAULT_INDEX" as const,
          nullable: true,
        })) as Db2Table["columns"]
      : latestExecutionTable?.columns ?? selectedTable?.columns ?? [];
  const resultRows = normalizeRowsForDisplay(latestResult?.rows ?? selectedTable?.rows ?? [], resultColumns);
  const displayedTable = latestExecutionTable ?? selectedTable;
  const displayedTableRecordCount = getTableRecordCount(displayedTable);
  const displayedTableIndexLabels = getTableIndexLabels(displayedTable);
  const displayedTablePointColumns = getTablePointColumns(displayedTable);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={`db2-scrollbar flex shrink-0 flex-col border-r border-(--border) bg-(--surface-subtle) transition-[width] duration-200 ${sidebarCollapsed ? "w-16" : "w-72"}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-(--border) px-4 py-4">
          <div className={sidebarCollapsed ? "sr-only" : "block"}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-(--muted)">DB2 Playground</p>
            <h1 className="mt-1 text-sm font-semibold text-slate-900">Tables</h1>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-(--border) bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? "+" : "−"}
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {catalog.map((table) => {
            const isSelected = table.name === selectedTableName;
            const tableRows = getTableRecordCount(table);

            return (
              <button
                key={table.name}
                type="button"
                onClick={() => setSelectedTableName(table.name)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition ${isSelected ? "border-blue-200 bg-blue-50 shadow-sm" : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-semibold ${isSelected ? "text-blue-700" : "text-slate-900"}`}>
                      {sidebarCollapsed ? table.name.slice(0, 2).toUpperCase() : table.name}
                    </p>
                    <p className={`mt-1 text-xs ${isSelected ? "text-blue-700/80" : "text-slate-500"}`}>
                      {sidebarCollapsed ? `${tableRows}` : table.description}
                    </p>
                  </div>
                  {!sidebarCollapsed ? (
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      {tableRows} rows
                    </span>
                  ) : null}
                </div>

                {!sidebarCollapsed ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600">
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">
                      PK {getTablePrimaryKey(table)}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">
                      {table.columns.length} cols
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">
                      {tableRows} rows
                    </span>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </aside>

      <main className="db2-scrollbar flex min-w-0 flex-1 flex-col">
        <header className="border-b border-(--border) bg-white/90 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-(--muted)">Query workspace</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{selectedTable?.name ?? "No table selected"}</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>{catalog.length} tables loaded</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>{isRunning ? "Running query..." : liveParse.errors.length ? `Parser errors: ${liveParse.errors.length}` : `Parsed ${liveParse.statements.length} statements`}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <ActionButton variant="primary" onClick={handleRunQuery} disabled={isRunning}>
                Run query
              </ActionButton>
              <ActionButton variant="secondary" onClick={handleClearEditor}>
                Clear editor
              </ActionButton>
              <ActionButton variant="secondary" onClick={handleRefreshTables}>
                Refresh tables
              </ActionButton>
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[minmax(0,1.6fr)_360px]">
          <section className="flex min-h-140 flex-col overflow-hidden rounded-xl border border-(--border) bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-3 border-b border-(--border) px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Editor</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Supports SELECT, CREATE TABLE, INSERT, and DELETE statements.
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${liveParse.errors.length ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                {liveParse.errors.length ? "Syntax error" : `${liveParse.statements.length} statement${liveParse.statements.length === 1 ? "" : "s"}`}
              </span>
            </div>

            <div className="flex-1 bg-(--surface-subtle)">
              <Editor
                beforeMount={configureDb2Language}
                onMount={((editor, monaco) => {
                  configureDb2Language(monaco);
                  monaco.editor.setTheme(THEME_ID);
                  editor.focus();
                }) as OnMount}
                value={query}
                onChange={(value) => setQuery(value ?? "")}
                language={LANGUAGE_ID}
                theme={THEME_ID}
                height="100%"
                options={{
                  automaticLayout: true,
                  minimap: { enabled: false },
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 13,
                  lineHeight: 20,
                  scrollBeyondLastLine: false,
                  roundedSelection: false,
                  renderLineHighlight: "all",
                  wordWrap: "off",
                  padding: { top: 16, bottom: 16 },
                  lineNumbers: "on",
                  guides: {
                    indentation: true,
                  },
                }}
              />
            </div>

            <div className="grid gap-2 border-t border-(--border) px-4 py-3 text-xs text-slate-600 md:grid-cols-3">
              <Metric label="Statements" value={`${liveParse.statements.length} parsed`} />
              <Metric label="Errors" value={`${liveParse.errors.length} issue${liveParse.errors.length === 1 ? "" : "s"}`} />
              <Metric label="Mode" value={summaryStatement?.type ?? "Program"} />
            </div>
          </section>

          <aside className="flex min-h-140 flex-col gap-4">
            <section className="overflow-hidden rounded-xl border border-(--border) bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="border-b border-(--border) px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Table details</h2>
                <p className="mt-0.5 text-xs text-slate-500">Schema and catalog metadata for the selected table.</p>
              </div>

              <div className="space-y-4 p-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-(--muted)">Schema</p>
                  <div className="mt-3 space-y-2">
                    {displayedTable?.columns.map((column) => (
                      <div
                        key={column.name}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">{column.name}</p>
                          <p className="text-xs text-slate-500">{column.type}</p>
                        </div>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {column.index}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-(--muted)">Catalog snapshot</p>
                  <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <InfoTile label="Records" value={`${displayedTableRecordCount}`} />
                      <InfoTile label="Primary key" value={getTablePrimaryKey(displayedTable)} />
                      <InfoTile label="Indexed columns" value={`${displayedTableIndexLabels.length}`} />
                      <InfoTile label="Point columns" value={`${displayedTablePointColumns.length}`} />
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Indexed column map</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {displayedTableIndexLabels.length ? (
                          displayedTableIndexLabels.map((label) => (
                            <span key={label} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                              {label}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500">No index metadata available yet.</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Point columns</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {displayedTablePointColumns.length ? (
                          displayedTablePointColumns.map((columnName) => (
                            <span key={columnName} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                              {columnName}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500">No point-indexed columns yet.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>

        <section className="border-t border-(--border) bg-white px-4 py-4">
          <div className="overflow-hidden rounded-xl border border-(--border) bg-(--surface-subtle)">
            <div className="flex items-center justify-between gap-3 border-b border-(--border) px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Results</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Latest query output or a table preview when no query has been executed.
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${executionError ? "bg-rose-50 text-rose-700" : latestResult ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}
              >
                {executionError ?? latestResult?.message ?? "Waiting for execution"}
              </span>
            </div>

            {executionError ? (
              <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {executionError}
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <TablePreview rows={resultRows} columns={resultColumns} />
            </div>

            <div className="grid gap-4 border-t border-(--border) bg-white px-4 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-(--muted)">Parser status</p>
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  {parseError ? (
                    <>
                      <p className="font-medium text-rose-700">{parseError.message}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        Line {parseError.context.line}, column {parseError.context.column}.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-slate-900">{summaryStatement?.type ?? "Program parsed"}</p>
                      <p className="mt-1 text-xs text-slate-600">{renderAstSummary(summaryStatement)}</p>
                    </>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-(--muted)">Grammar notes</p>
                <ul className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                  <li>
                    SELECT requires a WHERE clause, and supports <span className="font-mono text-slate-900">*</span> or explicit column lists.
                  </li>
                  <li>WHERE supports comparisons, BETWEEN, and IN predicates for SELECT.</li>
                  <li>CREATE TABLE accepts PRIMARY KEY, column indexes and optional FROM FILE source.</li>
                  <li>INSERT and DELETE update the in-memory catalog (DELETE restricted to comparisons).</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function renderAstSummary(statement: Db2Statement | null): string {
  if (!statement) {
    return "No statements parsed.";
  }

  if (statement.type === "Select") {
    const columnsText = statement.columns === "*" ? "*" : statement.columns.join(", ");
    return statement.where
      ? `SELECT ${columnsText} FROM ${statement.table} with ${statement.where.type.toLowerCase()} predicate.`
      : `SELECT ${columnsText} FROM ${statement.table} without a WHERE clause.`;
  }

  if (statement.type === "CreateTable") {
    return `CREATE TABLE ${statement.table} with ${statement.columns.length} column${statement.columns.length === 1 ? "" : "s"}.`;
  }

  if (statement.type === "Insert") {
    return `INSERT INTO ${statement.table} with ${statement.values.length} value${statement.values.length === 1 ? "" : "s"}.`;
  }

  return statement.where
    ? `DELETE FROM ${statement.table} with a WHERE clause.`
    : `DELETE FROM ${statement.table} without a WHERE clause.`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        isPrimary
          ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
          : "border-(--border) bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

function TablePreview({
  rows,
  columns,
}: {
  rows: Db2Row[];
  columns: Db2Table["columns"];
}) {
  if (!columns.length) {
    return <div className="px-4 py-6 text-sm text-slate-500">No columns available.</div>;
  }

  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead className="bg-slate-100 text-xs uppercase tracking-[0.18em] text-slate-500">
        <tr>
          {columns.map((column) => (
            <th key={column.name} className="border-b border-slate-200 px-3 py-2 font-medium">
              {column.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white">
        {rows.length ? (
          rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-white even:bg-slate-50">
              {columns.map((column) => (
                <td key={column.name} className="border-b border-slate-200 px-3 py-2 font-mono text-[12px] text-slate-800">
                  {formatCell(row[column.name])}
                </td>
              ))}
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={columns.length} className="px-3 py-6 text-sm text-slate-500">
              No rows to display.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function formatCell(value: Db2Row[string]) {
  if (value === null) {
    return "NULL";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}