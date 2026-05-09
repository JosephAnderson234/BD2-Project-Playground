export const DB2_KEYWORDS = [
  "CREATE",
  "TABLE",
  "SELECT",
  "FROM",
  "WHERE",
  "INSERT",
  "INTO",
  "VALUES",
  "DELETE",
  "FILE",
  "INDEX",
  "SEQUENTIAL",
  "HASH",
  "BTREE",
  "RTREE",
  "BETWEEN",
  "AND",
  "IN",
  "POINT",
  "RADIUS",
  "K",
  "DEFAULT_INDEX",
  "INT",
  "FLOAT",
  "VARCHAR",
  "PRIMARY",
  "KEY",
] as const;

export const DB2_INDEX_TYPES = ["SEQUENTIAL", "HASH", "BTREE", "RTREE", "DEFAULT_INDEX"] as const;

export const DB2_DATA_TYPES = ["INT", "FLOAT", "VARCHAR"] as const;

export const DB2_OPERATORS = ["=", "<", ">", "<=", ">=", "!="] as const;

export const DB2_LANGUAGE_SNIPPETS = [
  {
    label: "SELECT * FROM ...",
    detail: "Select rows from a table",
    insertText: "SELECT * FROM ${1:table} WHERE ${2:column} = ${3:value};",
  },
  {
    label: "SELECT list FROM ...",
    detail: "Select a column list from a table",
    insertText: "SELECT ${1:column1}, ${2:column2} FROM ${3:table} WHERE ${4:column} <= ${5:value};",
  },
  {
    label: "CREATE TABLE ...",
    detail: "Create a table with typed columns",
    insertText: "CREATE TABLE ${1:table} (${2:id} INT INDEX BTREE, ${3:name} VARCHAR);",
  },
  {
    label: "INSERT INTO ... VALUES",
    detail: "Insert a new row",
    insertText: "INSERT INTO ${1:table} VALUES (${2:value1}, ${3:value2});",
  },
  {
    label: "DELETE FROM ... WHERE ...",
    detail: "Delete rows with a predicate",
    insertText: "DELETE FROM ${1:table} WHERE ${2:column} = ${3:value};",
  },
  {
    label: "Spatial IN",
    detail: "Spatial predicate with POINT and RADIUS",
    insertText: "SELECT * FROM ${1:table} WHERE ${2:field} IN (POINT(${3:x}, ${4:y}), RADIUS ${5:radius});",
  },
] as const;
