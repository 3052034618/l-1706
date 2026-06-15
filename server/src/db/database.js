const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

let db = null;
let dataFilePath = null;

function initDatabase() {
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  dataFilePath = path.join(dataDir, 'echo-workshop.json');
  
  if (fs.existsSync(dataFilePath)) {
    try {
      const data = fs.readFileSync(dataFilePath, 'utf-8');
      db = JSON.parse(data);
    } catch (e) {
      db = createEmptyDatabase();
    }
  } else {
    db = createEmptyDatabase();
    seedInitialData();
    saveDatabase();
  }

  console.log('✅ 数据库初始化完成 (JSON存储)');
  return db;
}

function createEmptyDatabase() {
  return {
    players: [],
    workshops: [],
    echosmiths: [],
    materials: [],
    player_materials: [],
    recipes: [],
    detectors: [],
    crafting_tasks: [],
    contests: [],
    contest_entries: [],
    contest_skills: [],
    market_listings: [],
    market_transactions: [],
    guilds: [],
    guild_members: [],
    resonance_towers: [],
    sound_tide_events: [],
    industry_reports: [],
    leaderboard_snapshots: []
  };
}

function saveDatabase() {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('保存数据库失败:', e);
  }
}

class QueryBuilder {
  constructor(tableName) {
    this.tableName = tableName;
    this.conditions = [];
    this.orderByField = null;
    this.orderDirection = 'ASC';
    this.limitCount = null;
    this.offsetCount = 0;
  }

  where(field, operator, value) {
    if (value === undefined) {
      value = operator;
      operator = '=';
    }
    this.conditions.push({ field, operator, value });
    return this;
  }

  orderBy(field, direction = 'ASC') {
    this.orderByField = field;
    this.orderDirection = direction.toUpperCase();
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  offset(count) {
    this.offsetCount = count;
    return this;
  }

  _filterRows(rows) {
    return rows.filter(row => {
      return this.conditions.every(cond => {
        switch (cond.operator) {
          case '=': return row[cond.field] === cond.value;
          case '!=': return row[cond.field] !== cond.value;
          case '>': return row[cond.field] > cond.value;
          case '>=': return row[cond.field] >= cond.value;
          case '<': return row[cond.field] < cond.value;
          case '<=': return row[cond.field] <= cond.value;
          default: return row[cond.field] === cond.value;
        }
      });
    });
  }

  _sortRows(rows) {
    if (!this.orderByField) return rows;
    
    return [...rows].sort((a, b) => {
      const aVal = a[this.orderByField];
      const bVal = b[this.orderByField];
      
      if (aVal === bVal) return 0;
      const result = aVal > bVal ? 1 : -1;
      return this.orderDirection === 'DESC' ? -result : result;
    });
  }

  _paginate(rows) {
    let result = rows;
    if (this.offsetCount > 0) {
      result = result.slice(this.offsetCount);
    }
    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount);
    }
    return result;
  }

  all() {
    let rows = db[this.tableName] || [];
    rows = this._filterRows(rows);
    rows = this._sortRows(rows);
    rows = this._paginate(rows);
    return rows;
  }

  get() {
    const rows = this.all();
    return rows[0] || undefined;
  }

  count() {
    const rows = this._filterRows(db[this.tableName] || []);
    return { count: rows.length };
  }

  insert(data) {
    const row = { ...data };
    if (!row.id) {
      row.id = uuid();
    }
    db[this.tableName].push(row);
    saveDatabase();
    return row;
  }

  update(data) {
    const rows = this._filterRows(db[this.tableName] || []);
    rows.forEach(row => {
      Object.assign(row, data);
    });
    saveDatabase();
    return { changes: rows.length };
  }

  delete() {
    const before = db[this.tableName].length;
    db[this.tableName] = db[this.tableName].filter(row => {
      return !this.conditions.every(cond => {
        switch (cond.operator) {
          case '=': return row[cond.field] === cond.value;
          case '!=': return row[cond.field] !== cond.value;
          default: return row[cond.field] === cond.value;
        }
      });
    });
    saveDatabase();
    return { changes: before - db[this.tableName].length };
  }
}

function _parseWhereConditions(whereStr) {
  const conditions = [];
  const parts = whereStr.split(/\s+AND\s+/i);
  
  parts.forEach(part => {
    const trimmed = part.trim();
    
    const inMatch = trimmed.match(/([\w.]+)\s+IN\s*\(([^)]+)\)/i);
    if (inMatch) {
      const field = inMatch[1].includes('.') ? inMatch[1].split('.').pop() : inMatch[1];
      conditions.push({
        type: 'in',
        field,
        values: inMatch[2].split(',').map(v => v.trim())
      });
      return;
    }
    
    const match = trimmed.match(/([\w.]+)\s*(=|!=|>=|<=|>|<)\s*(.+)/i);
    if (match) {
      const field = match[1].includes('.') ? match[1].split('.').pop() : match[1];
      conditions.push({
        type: 'compare',
        field,
        op: match[2],
        value: match[3].trim()
      });
    }
  });
  
  return conditions;
}

function _parseSelectFields(sql) {
  const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
  if (!selectMatch) return [];
  
  const selectClause = selectMatch[1];
  const fields = [];
  
  const parts = selectClause.split(',').map(p => p.trim());
  
  parts.forEach(part => {
    if (part === '*' || part.endsWith('.*')) {
      const aliasMatch = part.match(/^(\w+)\.\*$/);
      fields.push({
        type: 'wildcard',
        tableAlias: aliasMatch ? aliasMatch[1] : null
      });
    } else {
      const asMatch = part.match(/^([\w.]+)\s+AS\s+(\w+)$/i) || part.match(/^([\w.]+)\s+(\w+)$/i);
      if (asMatch) {
        const fieldRaw = asMatch[1];
        const alias = asMatch[2];
        const tableMatch = fieldRaw.match(/^(\w+)\.(\w+)$/);
        fields.push({
          type: 'field',
          tableAlias: tableMatch ? tableMatch[1] : null,
          field: tableMatch ? tableMatch[2] : fieldRaw,
          alias: alias
        });
      } else {
        const tableMatch = part.match(/^(\w+)\.(\w+)$/);
        fields.push({
          type: 'field',
          tableAlias: tableMatch ? tableMatch[1] : null,
          field: tableMatch ? tableMatch[2] : part,
          alias: null
        });
      }
    }
  });
  
  return fields;
}

function _applyJoins(sql, rows) {
  const joinRegex = /JOIN\s+(\w+)(?:\s+(\w+))?\s+ON\s+([\w.]+)\s*=\s*([\w.]+)/gi;
  const selectFields = _parseSelectFields(sql);
  let match;
  let result = [...rows];
  
  while ((match = joinRegex.exec(sql)) !== null) {
    const joinTableName = match[1];
    const joinTableAlias = match[2] || joinTableName;
    const leftFieldRaw = match[3];
    const rightFieldRaw = match[4];
    
    const leftField = leftFieldRaw.includes('.') ? leftFieldRaw.split('.').pop() : leftFieldRaw;
    const rightField = rightFieldRaw.includes('.') ? rightFieldRaw.split('.').pop() : rightFieldRaw;
    
    if (!db[joinTableName]) continue;
    
    const joinRows = db[joinTableName];
    
    const joinFieldAliases = {};
    selectFields.forEach(f => {
      if (f.type === 'field' && f.tableAlias === joinTableAlias && f.alias) {
        joinFieldAliases[f.field] = f.alias;
      }
    });
    
    const selectAllFromJoin = selectFields.some(f => f.type === 'wildcard' && (f.tableAlias === null || f.tableAlias === joinTableAlias));
    
    result = result.map(row => {
      const matched = joinRows.find(jr => jr[rightField] === row[leftField]);
      if (matched) {
        const merged = { ...row };
        Object.keys(matched).forEach(key => {
          if (joinFieldAliases[key]) {
            merged[joinFieldAliases[key]] = matched[key];
          } else if (selectAllFromJoin) {
            merged[key] = matched[key];
          } else if (!merged.hasOwnProperty(key)) {
            merged[key] = matched[key];
          }
        });
        return merged;
      }
      return row;
    });
  }
  
  return result;
}

function _applyConditions(rows, conditions, params) {
  let paramIdx = 0;
  
  const resolvedConditions = conditions.map(cond => {
    if (cond.type === 'in') {
      const resolvedValues = cond.values.map(v => {
        if (v === '?') {
          return params[paramIdx++];
        }
        if (v.startsWith("'") && v.endsWith("'")) {
          return v.slice(1, -1);
        }
        if (!isNaN(parseFloat(v))) {
          return parseFloat(v);
        }
        return v;
      });
      return { ...cond, resolvedValues };
    }
    
    if (cond.type === 'compare') {
      let resolvedValue;
      if (cond.value === '?') {
        resolvedValue = params[paramIdx++];
      } else if (cond.value.startsWith("'") && cond.value.endsWith("'")) {
        resolvedValue = cond.value.slice(1, -1);
      } else if (!isNaN(parseFloat(cond.value))) {
        resolvedValue = parseFloat(cond.value);
      } else {
        resolvedValue = cond.value;
      }
      return { ...cond, resolvedValue };
    }
    
    return cond;
  });
  
  const result = rows.filter(row => {
    return resolvedConditions.every(cond => {
      if (cond.type === 'in') {
        return cond.resolvedValues.includes(row[cond.field]);
      }
      
      if (cond.type === 'compare') {
        switch (cond.op) {
          case '=': return row[cond.field] === cond.resolvedValue;
          case '!=': return row[cond.field] !== cond.resolvedValue;
          case '>': return row[cond.field] > cond.resolvedValue;
          case '>=': return row[cond.field] >= cond.resolvedValue;
          case '<': return row[cond.field] < cond.resolvedValue;
          case '<=': return row[cond.field] <= cond.resolvedValue;
          default: return row[cond.field] === cond.resolvedValue;
        }
      }
      
      return true;
    });
  });
  
  return { result, paramIdx };
}

function prepare(sql) {
  return {
    run(...params) {
      const tableMatch = sql.match(/(?:INSERT INTO|UPDATE|FROM)\s+(\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : null;
      
      if (sql.trim().toUpperCase().startsWith('INSERT')) {
        const row = {};
        
        const parenMatches = [...sql.matchAll(/\(([^)]+)\)/g)];
        
        if (parenMatches.length >= 2) {
          const columns = parenMatches[0][1].split(',').map(c => c.trim().replace(/"/g, ''));
          const valuesStr = parenMatches[1][1];
          
          const valueTokens = valuesStr.split(',').map(v => v.trim());
          let paramIdx = 0;
          
          columns.forEach((col, i) => {
            const token = valueTokens[i] || '';
            if (token === '?') {
              row[col] = params[paramIdx++];
            } else if (token === "NULL" || token === "null") {
              row[col] = null;
            } else if (token.startsWith("'") && token.endsWith("'")) {
              row[col] = token.slice(1, -1);
            } else if (!isNaN(parseFloat(token)) && token !== '') {
              row[col] = parseFloat(token);
            } else {
              row[col] = token;
            }
          });
        }
        
        if (!row.id) {
          row.id = uuid();
        }
        if (tableName && db[tableName]) {
          db[tableName].push(row);
          saveDatabase();
        }
        return { lastInsertRowid: row.id };
      }
      
      if (sql.trim().toUpperCase().startsWith('UPDATE')) {
        const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i);
        const whereMatch = sql.match(/WHERE\s+([\s\S]+?)$/i);
        
        if (tableName && db[tableName]) {
          const rows = db[tableName];
          let updated = 0;
          
          let setFields = [];
          if (setMatch) {
            setFields = setMatch[1].split(',').map(s => {
              const parts = s.trim().split('=');
              const field = parts[0].trim();
              const expr = parts.slice(1).join('=').trim();
              
              const hasPlaceholder = expr.includes('?');
              
              const fieldOpMatch = !hasPlaceholder && expr.match(/^(\w+)\s*([+\-*/])\s*(\d+\.?\d*)$/);
              
              return { 
                field, 
                isParam: hasPlaceholder, 
                isFieldOp: !!fieldOpMatch,
                fieldOpSource: fieldOpMatch ? fieldOpMatch[1] : null,
                fieldOpOperator: fieldOpMatch ? fieldOpMatch[2] : null,
                fieldOpLiteral: fieldOpMatch ? parseFloat(fieldOpMatch[3]) : null,
                expression: hasPlaceholder ? expr : null,
                value: hasPlaceholder ? null : expr
              };
            });
          }
          const setParamCount = setFields.filter(f => f.isParam).length;
          
          let whereConditions = [];
          if (whereMatch) {
            const whereParts = whereMatch[1].split(/\s+AND\s+/i);
            let whereParamIdx = 0;
            whereConditions = whereParts.map(part => {
              const [fieldRaw, op, ...rest] = part.trim().split(/\s+/);
              const field = fieldRaw.includes('.') ? fieldRaw.split('.').pop() : fieldRaw;
              const val = rest.join(' ');
              if (val === '?') {
                const paramIdx = setParamCount + whereParamIdx;
                whereParamIdx++;
                return { field, op, isParam: true, paramIdx };
              }
              return { field, op, isParam: false, value: val };
            });
          }
          
          rows.forEach(row => {
            let match = true;
            if (whereConditions.length > 0) {
              match = whereConditions.every(cond => {
                let value;
                if (cond.isParam) {
                  value = params[cond.paramIdx];
                } else {
                  if (!isNaN(parseFloat(cond.value)) && cond.value !== '') {
                    value = parseFloat(cond.value);
                  } else {
                    value = cond.value;
                  }
                }
                const rowValue = row[cond.field];
                const opResult = (() => {
                  switch (cond.op) {
                    case '=': return rowValue === value;
                    case '!=': return rowValue !== value;
                    case '>': return rowValue > value;
                    case '>=': return rowValue >= value;
                    case '<': return rowValue < value;
                    case '<=': return rowValue <= value;
                    default: return rowValue === value;
                  }
                })();
                return opResult;
              });
            }
            
            if (match) {
              let paramIdx = 0;
              setFields.forEach(setField => {
                if (setField.isParam) {
                  const expr = setField.expression;
                  const paramValue = params[paramIdx++];
                  
                  if (expr === '?') {
                    row[setField.field] = paramValue;
                  } else {
                    const placeholderIdx = expr.indexOf('?');
                    const beforePlaceholder = expr.substring(0, placeholderIdx).trim();
                    
                    let fieldName = null;
                    let operator = null;
                    
                    const addMatch = beforePlaceholder.match(/^(\w+)\s*\+$/);
                    const subMatch = beforePlaceholder.match(/^(\w+)\s*-$/);
                    const mulMatch = beforePlaceholder.match(/^(\w+)\s*\*$/);
                    const divMatch = beforePlaceholder.match(/^(\w+)\s*\/$/);
                    
                    if (addMatch) { fieldName = addMatch[1]; operator = '+'; }
                    else if (subMatch) { fieldName = subMatch[1]; operator = '-'; }
                    else if (mulMatch) { fieldName = mulMatch[1]; operator = '*'; }
                    else if (divMatch) { fieldName = divMatch[1]; operator = '/'; }
                    
                    if (fieldName && operator) {
                      const currentValue = row[fieldName] || 0;
                      switch (operator) {
                        case '+': row[setField.field] = currentValue + paramValue; break;
                        case '-': row[setField.field] = currentValue - paramValue; break;
                        case '*': row[setField.field] = currentValue * paramValue; break;
                        case '/': row[setField.field] = paramValue !== 0 ? currentValue / paramValue : 0; break;
                      }
                    } else {
                      row[setField.field] = paramValue;
                    }
                  }
                } else if (setField.isFieldOp) {
                  const currentValue = row[setField.fieldOpSource] || 0;
                  const literal = setField.fieldOpLiteral;
                  switch (setField.fieldOpOperator) {
                    case '+': row[setField.field] = currentValue + literal; break;
                    case '-': row[setField.field] = currentValue - literal; break;
                    case '*': row[setField.field] = currentValue * literal; break;
                    case '/': row[setField.field] = literal !== 0 ? currentValue / literal : 0; break;
                  }
                } else if (!isNaN(parseFloat(setField.value)) && setField.value !== '') {
                  row[setField.field] = parseFloat(setField.value);
                } else {
                  const cleanValue = setField.value.replace(/^['"]|['"]$/g, '');
                  row[setField.field] = cleanValue;
                }
              });
              updated++;
            }
          });
          
          saveDatabase();
          return { changes: updated };
        }
      }
      
      if (sql.trim().toUpperCase().startsWith('DELETE')) {
        const tableMatch = sql.match(/FROM\s+(\w+)/i);
        const tableName = tableMatch ? tableMatch[1] : null;
        const whereMatch = sql.match(/WHERE\s+([\s\S]+?)$/i);
        
        if (tableName && db[tableName]) {
          let whereConditions = [];
          if (whereMatch) {
            const conditions = _parseWhereConditions(whereMatch[1]);
            const applied = _applyConditions([], conditions, params);
            whereConditions = conditions.map(c => {
              if (c.type === 'compare' && c.value === '?') {
                return { ...c, value: params[applied.paramIdx++] };
              }
              return c;
            });
          }
          
          const before = db[tableName].length;
          db[tableName] = db[tableName].filter(row => {
            if (whereConditions.length === 0) return false;
            return !whereConditions.every(cond => {
              if (cond.type === 'in') {
                return cond.values.includes(String(row[cond.field]));
              }
              const rowVal = row[cond.field];
              const condVal = !isNaN(parseFloat(cond.value)) && String(parseFloat(cond.value)) === String(cond.value) 
                ? parseFloat(cond.value) 
                : String(cond.value).replace(/^['"]|['"]$/g, '');
              switch (cond.op) {
                case '=': return rowVal === condVal;
                case '!=': return rowVal !== condVal;
                case '>': return rowVal > condVal;
                case '>=': return rowVal >= condVal;
                case '<': return rowVal < condVal;
                case '<=': return rowVal <= condVal;
                default: return rowVal === condVal;
              }
            });
          });
          saveDatabase();
          return { changes: before - db[tableName].length };
        }
        return { changes: 0 };
      }
      
      return { changes: 0 };
    },
    
    get(...params) {
      const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
      const tableMatch = sql.match(/FROM\s+(\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : null;
      
      if (tableName && db[tableName]) {
        const rows = db[tableName];
        const isCount = selectMatch && /COUNT\(\s*\*\s*\)/i.test(selectMatch[1]);
        
        let result = [...rows];
        result = _applyJoins(sql, result);
        
        const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:ORDER|LIMIT|$)/i);
        if (whereMatch) {
          const conditions = _parseWhereConditions(whereMatch[1]);
          const filtered = _applyConditions(result, conditions, params);
          result = filtered.result;
        }
        
        const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
        if (orderMatch && !isCount) {
          const orderField = orderMatch[1];
          const orderDir = (orderMatch[2] || 'ASC').toUpperCase();
          result.sort((a, b) => {
            if (a[orderField] === b[orderField]) return 0;
            return (a[orderField] > b[orderField] ? 1 : -1) * (orderDir === 'DESC' ? -1 : 1);
          });
        }
        
        const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/i);
        if (limitMatch && !isCount) {
          const offset = limitMatch[2] ? parseInt(limitMatch[1]) : 0;
          const limit = limitMatch[2] ? parseInt(limitMatch[2]) : parseInt(limitMatch[1]);
          result = result.slice(offset, offset + limit);
        }
        
        if (isCount) {
          const countAliasMatch = selectMatch[1].match(/AS\s+(\w+)/i);
          const countKey = countAliasMatch ? countAliasMatch[1] : 'count';
          return { [countKey]: result.length };
        }
        
        return result[0];
      }
      
      return undefined;
    },
    
    all(...params) {
      const tableMatch = sql.match(/FROM\s+(\w+)/i);
      const tableName = tableMatch ? tableMatch[1] : null;
      
      if (tableName && db[tableName]) {
        let result = [...db[tableName]];
        result = _applyJoins(sql, result);
        
        const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:ORDER BY|LIMIT|$)/i);
        if (whereMatch) {
          const conditions = _parseWhereConditions(whereMatch[1]);
          const filtered = _applyConditions(result, conditions, params);
          result = filtered.result;
        }
        
        const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
        if (orderMatch) {
          const orderField = orderMatch[1];
          const orderDir = (orderMatch[2] || 'ASC').toUpperCase();
          result.sort((a, b) => {
            if (a[orderField] === b[orderField]) return 0;
            return (a[orderField] > b[orderField] ? 1 : -1) * (orderDir === 'DESC' ? -1 : 1);
          });
        }
        
        const limitMatch = sql.match(/LIMIT\s+(\d+)(?:\s*,\s*(\d+))?/i);
        if (limitMatch) {
          const offset = limitMatch[2] ? parseInt(limitMatch[1]) : 0;
          const limit = limitMatch[2] ? parseInt(limitMatch[2]) : parseInt(limitMatch[1]);
          result = result.slice(offset, offset + limit);
        }
        
        return result;
      }
      
      return [];
    }
  };
}

function seedInitialData() {
  if (db.materials.length > 0) return;

  const materials = [
    { id: 'mat_crystal_common', name: '普通声波水晶', type: 'crystal', rarity: 'common', quality: 30, description: '基础的声波水晶，蕴含微弱的共鸣能量', icon: '💎' },
    { id: 'mat_crystal_rare', name: '稀有声波水晶', type: 'crystal', rarity: 'rare', quality: 70, description: '稀有水晶，共鸣效果更加强烈', icon: '💠' },
    { id: 'mat_crystal_epic', name: '史诗声波水晶', type: 'crystal', rarity: 'epic', quality: 85, description: '史诗级水晶，传说中能捕捉远古回响', icon: '🔮' },
    { id: 'mat_crystal_legendary', name: '传说声波水晶', type: 'crystal', rarity: 'legendary', quality: 95, description: '传说级水晶，来自深渊的神秘力量', icon: '🌟' },
    { id: 'mat_resonator_wood', name: '木制共鸣器', type: 'resonator', rarity: 'common', quality: 25, description: '基础木制共鸣器，传递声波', icon: '🪵' },
    { id: 'mat_resonator_metal', name: '金属共鸣器', type: 'resonator', rarity: 'rare', quality: 65, description: '精金打造的共鸣器，传导效率更高', icon: '🔔' },
    { id: 'mat_resonator_crystal', name: '水晶共鸣器', type: 'resonator', rarity: 'epic', quality: 80, description: '水晶共鸣器，能净化声波杂质', icon: '🎐' },
    { id: 'mat_core_basic', name: '基础探测核心', type: 'core', rarity: 'common', quality: 40, description: '基础探测核心，探测器的心脏', icon: '⚙️' },
    { id: 'mat_core_advanced', name: '高级探测核心', type: 'core', rarity: 'rare', quality: 70, description: '高级核心，提升探测精度', icon: '⚡' },
    { id: 'mat_amplifier_small', name: '小型声波放大器', type: 'amplifier', rarity: 'common', quality: 35, description: '放大小范围声波', icon: '📢' },
    { id: 'mat_amplifier_large', name: '大型声波放大器', type: 'amplifier', rarity: 'rare', quality: 60, description: '大范围声波增强', icon: '📡' },
    { id: 'mat_essence_echo', name: '回响精华', type: 'essence', rarity: 'epic', quality: 90, description: '神秘精华，可能触发隐藏属性', icon: '✨' }
  ];

  db.materials = materials;

  const recipes = [
    {
      id: 'recipe_basic_echolocator',
      name: '基础回声探测器',
      description: '入门级探测器，适合新手使用',
      tier: 1,
      craft_time: 30,
      base_range: 80,
      base_precision: 40,
      materials: JSON.stringify([
        { material_id: 'mat_crystal_common', quantity: 3 },
        { material_id: 'mat_resonator_wood', quantity: 2 },
        { material_id: 'mat_core_basic', quantity: 1 }
      ]),
      unlocked: 1
    },
    {
      id: 'recipe_precision_listener',
      name: '精准听器',
      description: '专注于精度的探测器',
      tier: 2,
      craft_time: 60,
      base_range: 60,
      base_precision: 80,
      materials: JSON.stringify([
        { material_id: 'mat_crystal_rare', quantity: 2 },
        { material_id: 'mat_resonator_metal', quantity: 3 },
        { material_id: 'mat_core_advanced', quantity: 1 },
        { material_id: 'mat_amplifier_small', quantity: 2 }
      ]),
      unlocked: 1
    },
    {
      id: 'recipe_long_range_scanner',
      name: '远程扫描仪',
      description: '超远距离探测，牺牲部分精度',
      tier: 2,
      craft_time: 60,
      base_range: 200,
      base_precision: 35,
      materials: JSON.stringify([
        { material_id: 'mat_crystal_rare', quantity: 3 },
        { material_id: 'mat_resonator_wood', quantity: 5 },
        { material_id: 'mat_amplifier_large', quantity: 2 },
        { material_id: 'mat_core_basic', quantity: 2 }
      ]),
      unlocked: 1
    },
    {
      id: 'recipe_echo_harvester',
      name: '回响收割者',
      description: '高品质探测器，有几率获得稀有词缀',
      tier: 3,
      craft_time: 120,
      base_range: 150,
      base_precision: 70,
      materials: JSON.stringify([
        { material_id: 'mat_crystal_epic', quantity: 1 },
        { material_id: 'mat_crystal_rare', quantity: 3 },
        { material_id: 'mat_resonator_crystal', quantity: 2 },
        { material_id: 'mat_core_advanced', quantity: 2 },
        { material_id: 'mat_essence_echo', quantity: 1 }
      ]),
      unlocked: 1
    },
    {
      id: 'recipe_legendary_oracle',
      name: '神谕探测器',
      description: '传说级探测器，拥有强大力量',
      tier: 5,
      craft_time: 300,
      base_range: 300,
      base_precision: 90,
      materials: JSON.stringify([
        { material_id: 'mat_crystal_legendary', quantity: 1 },
        { material_id: 'mat_crystal_epic', quantity: 2 },
        { material_id: 'mat_resonator_crystal', quantity: 3 },
        { material_id: 'mat_core_advanced', quantity: 3 },
        { material_id: 'mat_essence_echo', quantity: 3 },
        { material_id: 'mat_amplifier_large', quantity: 2 }
      ]),
      unlocked: 1
    }
  ];

  db.recipes = recipes;

  console.log('✅ 初始数据已加载');
}

function getDb() {
  if (!db) {
    throw new Error('数据库未初始化');
  }
  return {
    prepare: (sql) => prepare(sql),
    exec: (sql) => {
      const statements = sql.split(';').filter(s => s.trim());
      statements.forEach(stmt => {
        if (stmt.trim().toUpperCase().startsWith('CREATE TABLE')) {
          const match = stmt.match(/CREATE TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)/i);
          if (match && !db[match[1]]) {
            db[match[1]] = [];
          }
        }
        if (stmt.trim().toUpperCase().startsWith('CREATE INDEX')) {
        }
      });
      saveDatabase();
    },
    pragma: () => {},
    transaction: (fn) => {
      return function(...args) {
        const dbSnapshot = JSON.parse(JSON.stringify(db));
        try {
          const result = fn(...args);
          saveDatabase();
          return result;
        } catch (error) {
          db = dbSnapshot;
          saveDatabase();
          throw error;
        }
      };
    }
  };
}

function query(tableName) {
  return new QueryBuilder(tableName);
}

module.exports = { initDatabase, getDb, query, saveDatabase };
