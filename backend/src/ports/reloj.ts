/** La hora, como puerto: el motor planifica y aplaza con ella y los tests la fijan. */
export interface Reloj {
  ahora(): Date;
}
