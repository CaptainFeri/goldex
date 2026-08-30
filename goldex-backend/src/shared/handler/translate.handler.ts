import {
  ArgumentsHost,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request } from 'express';
import { I18nContext, I18nValidationError } from 'nestjs-i18n';
import { ObjectKeyStringValue } from '../interface/response.interface';

interface ISeparateMessageResult {
  property: string;
  message: string;
  args: string[];
}

interface IMessageProperty {
  property?: string | null;
  message: string;
  args?: string[];
  translation?: string;
}

export class TranslateHandler {
  private i18n: I18nContext;

  separateMessage(text: string): ISeparateMessageResult {
    let property: string,
      message: string,
      argsString: string,
      args: Array<string>;
    if (text.indexOf(':') !== -1) {
      [message, argsString] = text.split(':');
      args = argsString.split(',');
      [property, message] = this.separateProperty(message);
    } else {
      [property, message] = this.separateProperty(text);
    }
    return { property, message, args };
  }

  separateProperty(text: string): [property: string, message: string] {
    if (text.indexOf('.') !== -1) {
      const [property, message] = text.split('.');
      return [property, message];
    }
    return [null, text];
  }

  getProperty(property: string): string {
    return property
      ? this.translate({
          translation: 'property',
          message: property.toUpperCase(),
        })
      : '';
  }

  getMessage(text: string): string {
    const { property, message, args } = this.separateMessage(text ?? 'SUCCESS');
    return this.translate({ property, message, args, translation: 'message' });
  }

  translate(props: IMessageProperty): string {
    return this.i18n.t(
      `${props.translation.toLowerCase()}.${props.message.toUpperCase()}`,
      {
        args: {
          property: this.getProperty(props.property),
          constraints: props.args,
        },
      },
    );
  }

  makeErrorObject(errors: Array<I18nValidationError>): ObjectKeyStringValue {
    let result = {};
    errors.forEach((error) => {
      result[error.property] = this.getMessage(this.makeErrorMessage(error));
    });
    return result as ObjectKeyStringValue;
  }

  makeErrorMessage(error: I18nValidationError): string {
    const key = this.selectCriticalMessage(error.constraints);
    const constraint = error.constraints[key];
    if (constraint.indexOf('|') == -1) {
      throw new InternalServerErrorException('Message invalid');
    }
    const [message, obj] = constraint.split('|');
    const detail = JSON.parse(obj);

    let result = `${error.property}.${message}`;
    if (detail.hasOwnProperty('constraints')) {
      result += `:${detail.constraints.join(',')}`;
    }
    return result;
  }

  selectCriticalMessage(constraints: { [type: string]: string }): string {
    const keys = Object.keys(constraints);
    return keys.find((key) => key === 'isNotEmpty') ? 'isNotEmpty' : keys[0];
  }

  protected setI18nContextFromRequest(context: ExecutionContext) {
    this.i18n = I18nContext.current(context);
  }

  protected setI18nContextFromArgumentHost(host: ArgumentsHost) {
    this.i18n = I18nContext.current(host);
  }
}
