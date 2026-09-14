import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  articles,
  categories,
  inquiryInterests,
  inquiries,
  media,
  pages,
  productImages,
  products,
  settings,
  spaceImages,
  spaces,
  submissionIdempotencyKeys,
  users,
} from "../../src/lib/db/schema";

describe("Drizzle schema declarations", () => {
  it("mirrors the checks, indexes, and gallery uniqueness in the authoritative SQL migration", () => {
    expect(checkNames(users)).toEqual(expect.arrayContaining(["users_role_check", "users_active_check"]));
    expect(checkNames(media)).toEqual(expect.arrayContaining(["media_byte_size_check", "media_deleted_check"]));
    expect(checkNames(inquiries)).toEqual(expect.arrayContaining(["inquiries_type_check", "inquiries_status_check"]));
    expect(checkNames(categories)).toContain("categories_status_check");
    expect(checkNames(products)).toContain("products_status_check");
    expect(checkNames(spaces)).toContain("spaces_status_check");
    expect(checkNames(articles)).toContain("articles_status_check");
    expect(checkNames(pages)).toContain("pages_status_check");
    expect(checkNames(submissionIdempotencyKeys)).toEqual(expect.arrayContaining([
      "submission_idempotency_type_check",
      "submission_idempotency_reference_check",
    ]));

    expect(uniqueNames(productImages)).toContain("product_images_product_media_unique");
    expect(uniqueNames(spaceImages)).toContain("space_images_space_media_unique");
    expect(primaryKeyNames(inquiryInterests)).toContain("inquiry_interests_primary");
    expect(indexNames(products)).toEqual(expect.arrayContaining(["products_status_category_idx", "products_status_updated_idx"]));
    expect(indexNames(inquiries)).toEqual(expect.arrayContaining(["inquiries_status_created_idx", "inquiries_assignee_status_idx", "inquiries_product_created_idx"]));
  });

  it("exposes JSON only for page sections and product specifications", () => {
    expect(Object.keys(inquiries)).not.toContain("interestsJson");
    expect(Object.keys(settings)).not.toContain("valueJson");
    expect(Object.keys(products)).toContain("specificationsJson");
    expect(Object.keys(pages)).toContain("sectionsJson");
  });
});

function checkNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).checks.map((entry) => entry.name);
}

function uniqueNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).uniqueConstraints.map((entry) => entry.getName() ?? "");
}

function indexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.map((entry) => entry.config.name);
}

function primaryKeyNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).primaryKeys.map((entry) => entry.getName());
}
