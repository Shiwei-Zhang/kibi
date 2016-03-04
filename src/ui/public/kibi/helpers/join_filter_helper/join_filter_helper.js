define(function (require) {
  return function JoinFilterHelperFactory(config, Private, savedDashboards, savedSearches, Promise, elasticsearchPlugins) {
    var _ = require('lodash');
    var replaceOrAddJoinSetFilter = require('ui/kibi/helpers/join_filter_helper/lib/replace_or_add_join_set_filter');

    var queryHelper = Private(require('ui/kibi/helpers/query_helper'));
    var urlHelper   = Private(require('ui/kibi/helpers/url_helper'));
    var kibiStateHelper = Private(require('ui/kibi/helpers/kibi_state_helper'));

    var _invert = function (obj) {
      var newObj = {};
      for (var prop in obj) {
        if (obj.hasOwnProperty(prop)) {
          newObj[obj[prop]] = prop;
        }
      }
      return newObj;
    };


    function JoinFilterHelper() {}

    JoinFilterHelper.prototype.getJoinFilter = function (focusDashboardId) {
      var self = this;
      if (focusDashboardId) {
        var relations = config.get('kibi:relations');
        if (!relations || !relations.relationsDashboards) {
          return Promise.reject(new Error('Could not get kibi:relations'));
        }
        relations = relations.relationsDashboards;
        // grab only enabled relations based on kibiState
        var enabledRelations = _.filter(relations, function (relation) {
          return kibiStateHelper.isRelationEnabled(relation);
        });

        // collect ids of dashboards from enabled relations
        var dashboardIds = _(enabledRelations).map(function (relation) {
          return relation.dashboards;
        }).flatten().uniq().value();

        if (dashboardIds.indexOf(focusDashboardId) === -1) {
          // focused dashboard is not part of enabled relation
          return Promise.resolve(null);
        }

        var focusedSavedSearch = urlHelper.getDashboardAndSavedSearchMetas([ focusDashboardId ]);
        var filtersPerIndexPromise = urlHelper.getFiltersPerIndexFromDashboards(dashboardIds);
        var queriesPerIndexPromise = urlHelper.getQueriesPerIndexFromDashboards(dashboardIds);

        return Promise.all([focusedSavedSearch, filtersPerIndexPromise, queriesPerIndexPromise]).then(function (data) {
          var [ [ savedDash, savedSearchMeta ] ] = data[0];
          var filtersPerIndex = data[1];
          var queriesPerIndex = data[2];

          var focusIndex = savedSearchMeta.index;

          // here check that the join filter should be present on this dashboard
          // it should be added only if we find current dashboardId in enabled relations
          var isFocusDashboardInEnabledRelations = urlHelper.isDashboardInTheseRelations(focusDashboardId, enabledRelations);
          if (!isFocusDashboardInEnabledRelations) {
            return Promise.reject(new Error('The join filter has no enabled relation for the focused dashboard : ' +  focusDashboardId));
          }

          return urlHelper.getIndexToDashboardMap(dashboardIds).then(function (indexToDashboardsMap) {

            var relations = _.map(enabledRelations, function (r) {
              var parts = r.relation.split('/');

              return [
                {
                  indices: [ parts[0].replace('-slash-', '/') ],
                  path: parts[1].replace('-slash-', '/')
                },
                {
                  indices: [ parts[2].replace('-slash-', '/') ],
                  path: parts[3].replace('-slash-', '/')
                }
              ];
            });

            var labels = queryHelper.getLabelOfIndexPatternsInConnectedComponent(focusIndex, relations);
            // keep only the filters which are in the connected component
            _.each(filtersPerIndex, function (filters, indexId) {
              if (!_.contains(labels, indexId)) {
                delete filtersPerIndex[indexId];
              }
            });

            // keep only the queries which are in the connected component
            _.each(queriesPerIndex, function (queries, indexId) {
              if (!_.contains(labels, indexId)) {
                delete queriesPerIndex[indexId];
              }
            });

            // build the join_set filter
            return queryHelper.constructJoinFilter(
              focusIndex,
              relations,
              filtersPerIndex,
              queriesPerIndex,
              indexToDashboardsMap
            );

          });

        });
      } else {
        return Promise.reject(new Error('Specify focusDashboardId'));
      }
    };

    JoinFilterHelper.prototype.updateJoinSetFilter = function (dashboards) {
      var self = this;
      var updateDashboards;
      var dashboardsClone;

      // define updateDashboards only if needed
      if (dashboards) {
        // define as well a dashboardsClone to make sure we do not modify passed
        // parameter
        dashboardsClone = _.cloneDeep(dashboards);

        updateDashboards = function (dashboardsArray) {
          if (!dashboardsArray.length) {
            return;
          }

          // the updateDashboards method is called recursively to process all dashboards
          // since we need to perform an operation if there is an error as well
          var dashboardId = dashboardsArray.pop();

          return self.getJoinFilter(dashboardId).then(function (joinFilter) {
            kibiStateHelper.addFilterToDashboard(dashboardId, joinFilter);
            return updateDashboards(dashboardsArray);
          }).catch(function (error) {
            kibiStateHelper.removeFilterOfTypeFromDashboard('join_set', dashboardId);
            return updateDashboards(dashboardsArray);
          });
        };
      }

      var currentDashboardId = urlHelper.getCurrentDashboardId();
      if (currentDashboardId) {

        return self.getJoinFilter(currentDashboardId).then(function (joinFilter) {
          if (!joinFilter) {
            urlHelper.removeJoinFilter();
          } else {
            urlHelper.addFilter(joinFilter);
          }
          if (updateDashboards) {
            return updateDashboards(dashboardsClone);
          }
        }).catch(function (error) {
          urlHelper.removeJoinFilter();
          if (updateDashboards) {
            return updateDashboards(dashboardsClone);
          }
        });

      } else {
        return Promise.resolve(urlHelper.removeJoinFilter()).then(function () {
          if (updateDashboards) {
            return updateDashboards(dashboardsClone);
          }
        });
      }
    };

    JoinFilterHelper.prototype.replaceOrAddJoinFilter = function (filterArray, joinFilter, stripMeta) {
      return replaceOrAddJoinSetFilter(filterArray, joinFilter, stripMeta);
    };

    JoinFilterHelper.prototype.isRelationalPanelEnabled = function () {
      return !!config.get('kibi:relationalPanel');
    };

    JoinFilterHelper.prototype.isSirenJoinPluginInstalled = function () {
      return elasticsearchPlugins.indexOf('siren-join') !== -1;
    };

    return new JoinFilterHelper();
  };
});