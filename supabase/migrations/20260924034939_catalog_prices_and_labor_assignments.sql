alter table workshop."CatalogItem"
  add column "purchasePrice" numeric(18,2),
  add column "salePrice" numeric(18,2);

alter table workshop."QuoteLine"
  add column "assignedMemberId" uuid;

alter table workshop."SaleLine"
  add column "assignedMemberId" uuid;

alter table workshop."QuoteLine"
  add constraint "QuoteLine_assignedMemberId_fkey"
  foreign key ("assignedMemberId") references workshop."Member"(id)
  on delete restrict on update cascade;

alter table workshop."SaleLine"
  add constraint "SaleLine_assignedMemberId_fkey"
  foreign key ("assignedMemberId") references workshop."Member"(id)
  on delete restrict on update cascade;

create index "QuoteLine_assignedMemberId_idx"
  on workshop."QuoteLine"("assignedMemberId");

create index "SaleLine_assignedMemberId_idx"
  on workshop."SaleLine"("assignedMemberId");

-- Preserve accounting history while giving the catalog a practical default.
-- Current owned-stock cost is preferred; supplier history fills gaps.
update workshop."CatalogItem" item
set "purchasePrice" = coalesce(
  (
    select round(sum(balance."materialCost") / nullif(sum(balance.quantity), 0), 2)
    from workshop."StockBalance" balance
    where balance."itemId" = item.id
      and balance."costKnown"
      and balance.quantity > 0
  ),
  (
    select offer."unitCost"
    from workshop."SupplierOffer" offer
    where offer."itemId" = item.id
    order by offer."observedAt" desc, offer.id desc
    limit 1
  )
)
where item.kind = 'PART'
  and item."purchasePrice" is null
  and (
    exists (
      select 1
      from workshop."StockBalance" balance
      where balance."itemId" = item.id
        and balance."costKnown"
        and balance.quantity > 0
    )
    or exists (
      select 1
      from workshop."SupplierOffer" offer
      where offer."itemId" = item.id
    )
  );

-- A recent accepted selling value is a safer default than inventing a markup.
update workshop."CatalogItem" item
set "salePrice" = coalesce(
  (
    select line."unitPrice"
    from workshop."SaleLine" line
    join workshop."Sale" sale on sale.id = line."saleId"
    where line."itemId" = item.id and sale.status = 'ISSUED'
    order by sale."issuedOn" desc, line.id desc
    limit 1
  ),
  (
    select line."unitPrice"
    from workshop."QuoteLine" line
    join workshop."Quote" quote on quote.id = line."quoteId"
    where line."itemId" = item.id and quote.status = 'APPROVED'
    order by quote."createdAt" desc, line.id desc
    limit 1
  )
)
where item."salePrice" is null
  and (
    exists (
      select 1
      from workshop."SaleLine" line
      join workshop."Sale" sale on sale.id = line."saleId"
      where line."itemId" = item.id and sale.status = 'ISSUED'
    )
    or exists (
      select 1
      from workshop."QuoteLine" line
      join workshop."Quote" quote on quote.id = line."quoteId"
      where line."itemId" = item.id and quote.status = 'APPROVED'
    )
  );
