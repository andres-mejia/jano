/**
 * El contador barato de ADR-003: cuándo vence el próximo paso, guardado fuera de
 * Aurora. El motor lo mira cada minuto y, si no hay nada vencido, termina sin
 * despertar la base de datos. Adelantarlo de más solo cuesta una consulta; por eso
 * la API lo adelanta tras confirmar cada transacción que planifica un paso.
 */
export interface EstadoDespertador {
  /** Próximo paso pendiente según la última revisión; `null`, ninguno. */
  readonly proximo: Date | null;
  readonly revisadoEn: Date;
}

export interface Despertador {
  /** `null` si nunca se ha revisado: entonces el motor consulta la base de datos. */
  leer(): Promise<EstadoDespertador | null>;
  /** El motor, tras revisar la base de datos. */
  fijar(estado: EstadoDespertador): Promise<void>;
  /** La API, al planificar un paso: lo adelanta si vence antes. */
  adelantar(cuando: Date): Promise<void>;
}
