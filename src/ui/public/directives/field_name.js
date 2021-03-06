define(function (require) {
  const module = require('ui/modules').get('kibana');
  const angular = require('angular');

  require('ui/filters/short_dots');

  module.directive('fieldName', function ($compile, $rootScope, $filter) {
    return {
      restrict: 'AE',
      scope: {
        field: '=',
        fieldName: '=',
        fieldType: '=',
        fieldAlias: '=?' // kibi: added fieldAlias to support column renaming in kibi-doc-table
      },
      link: function ($scope, $el) {

        const typeIcon = function (fieldType) {
          switch (fieldType) {
            case 'source':
              return '<i class="fa fa-file-text-o "></i>';
            case 'string':
              return '<i><strong>t</strong></i>';
            case 'murmur3':
              return '<i><strong>h</strong></i>';
            case 'number':
              return '<i><strong>#</strong></i>';
            case 'date':
              return '<i class="fa fa-clock-o"></i>';
            case 'ip':
              return '<i class="fa fa-laptop"></i>';
            case 'geo_point':
              return '<i class="fa fa-globe"></i>';
            case 'boolean':
              return '<i class="fa fa-adjust"></i>';
            case 'conflict':
              return '<i class="fa fa-warning"></i>';
            default:
              return '<i><strong>?</strong></i>';
          }
        };

        $rootScope.$watchMulti.call($scope, [
          'field',
          'fieldName',
          'fieldAlias',
          'fieldType',
          'field.rowCount'
        ], function () {

          const type = $scope.field ? $scope.field.type : $scope.fieldType;
          const name = $scope.field ? $scope.field.name : $scope.fieldName;
          const results = $scope.field ? !$scope.field.rowCount && !$scope.field.scripted : false;
          const scripted = $scope.field ? $scope.field.scripted : false;

          // kibi: support alias for column name
          // check if alias is different than original name to avoid showing
          // the same name in parenthesis
          if ($scope.fieldAlias && $scope.fieldAlias !== name) {
            $el.text($filter('shortDots')($scope.fieldAlias));
            $el.append(angular.element('<span class="original-field-name">(' + $filter('shortDots')(name) + ')</span>'));
          } else {
            $el.text($filter('shortDots')(name));
          }
          $el
            .attr('title', name)
            .toggleClass('no-results', results)
            .toggleClass('scripted', scripted)
            .prepend(typeIcon(type));
        });
      }
    };
  });
});
