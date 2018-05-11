import { showErrorMessage } from '../host';
import logger from '../logger';

export default function reportError(error) {
  logger.error(error);
  showErrorMessage(error);
}
