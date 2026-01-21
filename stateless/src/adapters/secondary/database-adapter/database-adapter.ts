import { logger } from "../../../shared/logger/logger";
import { getDbPool } from "../../../../../database/connection/database-connection";
import { QueryResultRow } from "pg";

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PagedResult<T> = {
  rows: T[];
  meta: PageMeta;
};

type ExtraWhereBlock = {
  clause: string;
  params: any[];
};

type ListQueryOptions = {
  /**
   * Can include aliases, e.g. "dcx.consultancies c"
   * IMPORTANT: this is used directly in SQL.
   */
  tableName: string;

  /** columns in the DB (snake_case) or aliased selects, e.g. [`skill_id as "skillId"`, "name"] */
  selectColumns: string[];

  /** stable order, e.g. ["name asc", "skill_id asc"] */
  orderBy: string[];

  page: number;
  pageSize: number;

  /** optional filters (exact match). Keys are DB column expressions, e.g. { "c.status": "active" } */
  equals?: Record<string, string | undefined>;

  /** optional case-insensitive equals, keys are DB column expressions, e.g. { "c.country": "UK" } */
  equalsLower?: Record<string, string | undefined>;

  /** optional "LIKE" on a pre-lowered column, e.g. name_lower */
  likeLower?: {
    column: string;
    term?: string;
  };

  /** optional extra where blocks, e.g. EXISTS filters */
  extraWhere?: ExtraWhereBlock[];
};

export async function createItem(
  tableName: string,
  item: Record<string, any>
): Promise<void> {
  const pool = await getDbPool();
  const keys = Object.keys(item);
  const values = Object.values(item);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

  const query = `
    INSERT INTO ${tableName} (${keys.join(", ")})
    VALUES (${placeholders})
  `;

  try {
    await pool.query(query, values);
  } catch (error) {
    logger.error("Error creating item", { error, tableName, item });
    throw error;
  }
}

export async function fetchAllItems<T>(tableName: string): Promise<T[]> {
  const pool = await getDbPool();
  const query = `SELECT * FROM ${tableName}`;

  try {
    const result = await pool.query(query);
    return result.rows as T[];
  } catch (error) {
    logger.error("Error fetching items", { error, tableName });
    throw error;
  }
}

export async function fetchOneById<T>(
  tableName: string,
  idColumn: string,
  id: string
): Promise<T | null> {
  const pool = await getDbPool();
  const query = `SELECT * FROM ${tableName} WHERE ${idColumn} = $1 LIMIT 1`;

  try {
    const result = await pool.query(query, [id]);
    return (result.rows[0] ?? null) as T | null;
  } catch (error) {
    logger.error("Error fetching item", { error, tableName, idColumn, id });
    throw error;
  }
}

export async function fetchManyByColumn<T extends QueryResultRow>(
  tableName: string,
  columnName: string,
  value: string
): Promise<T[]> {
  const pool = await getDbPool();

  const query = `
    SELECT *
    FROM ${tableName}
    WHERE ${columnName} = $1
  `;

  try {
    const result = await pool.query<T>(query, [value]);
    return result.rows as T[];
  } catch (error) {
    logger.error("Error fetching items by column", {
      error,
      tableName,
      columnName,
      value,
    });
    throw error;
  }
}
export async function fetchManyByIds<T>(
  tableName: string,
  idColumn: string,
  ids: string[]
): Promise<T[]> {
  const pool = await getDbPool();

  if (!ids || ids.length === 0) return [];

  const query = `
    SELECT *
    FROM ${tableName}
    WHERE ${idColumn} = ANY($1::text[])
  `;

  try {
    const result = await pool.query(query, [ids]);
    return result.rows as T[];
  } catch (error) {
    logger.error("Error fetching items by ids", { error, tableName, idColumn });
    throw error;
  }
}

export async function updateItemById(
  tableName: string,
  idColumn: string,
  id: string,
  updates: Record<string, any>
): Promise<void> {
  const pool = await getDbPool();

  const keys = Object.keys(updates);
  const values = Object.values(updates);

  const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");

  const query = `
    UPDATE ${tableName}
    SET ${setClause}
    WHERE ${idColumn} = $${keys.length + 1}
  `;

  try {
    await pool.query(query, [...values, id]);
  } catch (error) {
    logger.error("Error updating item", {
      error,
      tableName,
      idColumn,
      id,
      updates,
    });
    throw error;
  }
}

export async function listWithFiltersAndPagination<T extends QueryResultRow>(
  options: ListQueryOptions
): Promise<PagedResult<T>> {
  const pool = await getDbPool();

  const {
    tableName,
    selectColumns,
    orderBy,
    page,
    pageSize,
    equals,
    equalsLower,
    likeLower,
    extraWhere,
  } = options;

  const where: string[] = [];
  const params: any[] = [];
  let i = 1;

  const nonEmpty = (v: unknown) =>
    v !== undefined && v !== null && String(v).trim().length > 0;

  if (equals) {
    for (const [col, value] of Object.entries(equals)) {
      if (!nonEmpty(value)) continue;
      where.push(`${col} = $${i++}`);
      params.push(String(value).trim());
    }
  }

  if (equalsLower) {
    for (const [col, value] of Object.entries(equalsLower)) {
      if (!nonEmpty(value)) continue;
      where.push(`lower(${col}) = $${i++}`);
      params.push(String(value).trim().toLowerCase());
    }
  }

  if (likeLower?.term && nonEmpty(likeLower.term)) {
    where.push(`${likeLower.column} like $${i++}`);
    params.push(`%${String(likeLower.term).trim().toLowerCase()}%`);
  }

  // Extra WHERE blocks (e.g. EXISTS filters)
  if (Array.isArray(extraWhere) && extraWhere.length > 0) {
    for (const block of extraWhere) {
      if (!block?.clause || !Array.isArray(block.params)) continue;

      // Replace each "__PARAM__" in the clause with the next $n placeholder
      let clause = block.clause;
      for (const p of block.params) {
        clause = clause.replace("__PARAM__", `$${i++}`);
        params.push(p);
      }

      // Only add if there's something left after replacement/trim
      const trimmed = clause.trim();
      if (trimmed.length > 0) where.push(trimmed);
    }
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";

  // Count
  const countRes = await pool.query<{ total: string }>(
    `select count(*)::text as total from ${tableName} ${whereSql}`,
    params
  );

  const total = Number(countRes.rows?.[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total > 0 && page > totalPages) {
    return {
      rows: [],
      meta: { page, pageSize, total, totalPages },
    };
  }

  const offset = (page - 1) * pageSize;

  const limitParam = `$${i++}`;
  const offsetParam = `$${i++}`;
  const dataParams = [...params, pageSize, offset];

  const selectSql = selectColumns.join(", ");
  const orderSql = orderBy.join(", ");

  const sql = `
    select ${selectSql}
    from ${tableName}
    ${whereSql}
    order by ${orderSql}
    limit ${limitParam} offset ${offsetParam}
  `;

  try {
    const res = await pool.query<T>(sql, dataParams);
    return {
      rows: (res.rows ?? []) as T[],
      meta: { page, pageSize, total, totalPages },
    };
  } catch (error) {
    logger.error("Error listing items with pagination", {
      error,
      tableName,
      page,
      pageSize,
      equals,
      equalsLower,
      likeLower,
      extraWhere: extraWhere?.map((b) => ({
        clause: b.clause,
        paramsCount: b.params?.length ?? 0,
      })),
    });
    throw error;
  }
}

export async function deleteWhere(
  tableName: string,
  whereClause: string,
  params: any[]
): Promise<void> {
  const pool = await getDbPool();

  const sql = `
    delete from ${tableName}
    where ${whereClause}
  `;

  try {
    await pool.query(sql, params);
  } catch (error) {
    logger.error("Error deleting items", { error, tableName, whereClause });
    throw error;
  }
}

export async function deleteItemById(
  tableName: string,
  idColumn: string,
  id: string
): Promise<void> {
  const pool = await getDbPool();
  const query = `DELETE FROM ${tableName} WHERE ${idColumn} = $1`;

  try {
    await pool.query(query, [id]);
  } catch (error) {
    logger.error("Error deleting item", { error, tableName, idColumn, id });
    throw error;
  }
}

export async function fetchManyByAnyIds<T extends QueryResultRow>(
  tableName: string,
  idColumn: string,
  ids: string[]
): Promise<T[]> {
  const pool = await getDbPool();
  if (!ids || ids.length === 0) return [];

  const query = `
    SELECT *
    FROM ${tableName}
    WHERE ${idColumn} = ANY($1::text[])
  `;

  try {
    const result = await pool.query<T>(query, [ids]);
    return result.rows as T[];
  } catch (error) {
    logger.error("Error fetching items by any ids", {
      error,
      tableName,
      idColumn,
    });
    throw error;
  }
}
