import {
  MAX_MENU_ITEM_PRICE,
  type MenuItem,
  type UpdateMenuItemPriceRequest,
} from '@rms/api-contract';

export function getMenuItemPriceFormDefaults(
  item: Pick<MenuItem, 'price'>,
): UpdateMenuItemPriceRequest {
  return { price: item.price };
}

export function getMenuItemPriceFormLabels(name: string): {
  edit: string;
  price: string;
  save: string;
  cancel: string;
  hint: string;
} {
  return {
    edit: `Edit price for ${name}`,
    price: `Price for ${name}`,
    save: `Save price for ${name}`,
    cancel: `Cancel price edit for ${name}`,
    hint: `Maximum ${MAX_MENU_ITEM_PRICE}; up to 2 decimal places.`,
  };
}
